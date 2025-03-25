import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.js';
import sessionRoutes from './routes/sessions.js';

dotenv.config();

const app = express();
const httpServer = createServer(app);

// Allow both production and localhost origins
const allowedOrigins = [
  process.env.CLIENT_URL,
  process.env.LOCAL_CLIENT_URL,
  'http://localhost:5173',
  'http://localhost:3000',
  'https://digiboard-two.vercel.app'
];

// CORS configuration for Express
app.use(cors({
  origin: function(origin, callback) {
    if (!origin) return callback(null, true);

    if (allowedOrigins.indexOf(origin) === -1) {
      const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

// Configure Socket.IO with increased maximum HTTP buffer size for audio chunks
const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true,
    transports: ['websocket', 'polling'],
    allowedHeaders: ['Content-Type', 'Authorization']
  },
  allowEIO3: true,
  pingTimeout: 60000,
  pingInterval: 25000,
  maxHttpBufferSize: 1e8 // 100 MB, increased for audio chunks
});

// Keep track of live teachers and their sockets
const liveTeachers = new Map(); // teacherId -> Set of student sockets
const teachersWithAudioEnabled = new Set(); // Set of teacherIds with audio enabled
let currentLiveTeacher = null;

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use('/api/auth', authRoutes);
app.use('/api/sessions', sessionRoutes);

io.on('connection', (socket) => {
  console.log('[Socket] New connection');
  let currentTeacherId = null;
  let isStudent = false;

  socket.on('checkTeacherStatus', () => {
    console.log('[Socket] Checking teacher status, current live teacher:', currentLiveTeacher);
    if (currentLiveTeacher) {
      socket.emit('teacherOnline', { teacherId: currentLiveTeacher });
    }
  });

  socket.on('startLive', (teacherId) => {
    console.log('[Socket] Teacher starting live session:', teacherId);
    if (currentLiveTeacher && currentLiveTeacher !== teacherId) {
      socket.emit('liveError', {
        message: 'Another teacher is currently live. Please try again later.'
      });
      return;
    }

    liveTeachers.set(teacherId, new Set());
    currentTeacherId = teacherId;
    currentLiveTeacher = teacherId;
    socket.join(`teacher-${teacherId}`);
    io.emit('teacherOnline', { teacherId });
  });

  socket.on('stopLive', (teacherId, sessionData = {}) => {
    console.log('[Socket] Teacher stopping live session:', teacherId);
    if (liveTeachers.has(teacherId)) {
      const students = liveTeachers.get(teacherId);

      // Send the audioUrl to students for session saving
      students.forEach(studentSocket => {
        io.to(studentSocket.id).emit('teacherOffline', {
          teacherId,
          audioUrl: sessionData.audioUrl || null
        });
        studentSocket.leave(`teacher-${teacherId}`);
      });

      // Clean up audio
      teachersWithAudioEnabled.delete(teacherId);
      io.to(`teacher-${teacherId}`).emit('stopAudioStream', {
        teacherId
      });

      liveTeachers.delete(teacherId);
      if (currentLiveTeacher === teacherId) {
        currentLiveTeacher = null;
      }
    }

    if (currentTeacherId === teacherId) {
      socket.leave(`teacher-${teacherId}`);
      currentTeacherId = null;
    }
  });

  socket.on('joinTeacherRoom', (teacherId) => {
    console.log('[Socket] Student joining teacher room:', teacherId);
    if (liveTeachers.has(teacherId)) {
      socket.join(`teacher-${teacherId}`);
      liveTeachers.get(teacherId).add(socket);
      isStudent = true;
      currentTeacherId = teacherId;
      socket.emit('teacherOnline', { teacherId });

      // Notify student if teacher has audio enabled
      if (teachersWithAudioEnabled.has(teacherId)) {
        socket.emit('startAudioStream', { teacherId });
      }
    }
  });

  socket.on('leaveTeacherRoom', (teacherId) => {
    console.log('[Socket] Student leaving teacher room:', teacherId);
    if (liveTeachers.has(teacherId)) {
      liveTeachers.get(teacherId).delete(socket);
    }
    socket.leave(`teacher-${teacherId}`);
    if (currentTeacherId === teacherId) {
      currentTeacherId = null;
    }
  });

  socket.on('whiteboardUpdate', (data) => {
    socket.broadcast.to(`teacher-${data.teacherId}`).emit('whiteboardUpdate', data);
  });

  socket.on('startAudioStream', (data) => {
    if (!data || !data.teacherId) return;

    console.log('[Socket] Teacher starting audio stream:', data.teacherId);
    teachersWithAudioEnabled.add(data.teacherId);

    // Notify all students in the teacher's room that audio has started
    socket.broadcast.to(`teacher-${data.teacherId}`).emit('startAudioStream', {
      teacherId: data.teacherId
    });
  });

  socket.on('audioChunk', (data) => {
    if (!data || !data.teacherId || !data.chunk) return;

    // Only forward chunks if the teacher has audio enabled
    if (teachersWithAudioEnabled.has(data.teacherId)) {
      // Forward the audio chunk to all students in the teacher's room
      socket.broadcast.to(`teacher-${data.teacherId}`).emit('audioChunk', {
        teacherId: data.teacherId,
        chunk: data.chunk
      });
    }
  });

  socket.on('stopAudioStream', (data) => {
    if (!data || !data.teacherId) return;

    console.log('[Socket] Teacher stopping audio stream:', data.teacherId);
    teachersWithAudioEnabled.delete(data.teacherId);

    // Notify all students that the audio stream has stopped
    socket.broadcast.to(`teacher-${data.teacherId}`).emit('stopAudioStream', {
      teacherId: data.teacherId
    });
  });

  socket.on('disconnect', () => {
    console.log('[Socket] User disconnected, type:', isStudent ? 'student' : 'teacher');
    if (currentTeacherId) {
      if (isStudent) {
        if (liveTeachers.has(currentTeacherId)) {
          liveTeachers.get(currentTeacherId).delete(socket);
        }
      } else {
        if (liveTeachers.has(currentTeacherId)) {
          const students = liveTeachers.get(currentTeacherId);
          students.forEach(studentSocket => {
            io.to(studentSocket.id).emit('teacherOffline', { teacherId: currentTeacherId });
            studentSocket.leave(`teacher-${currentTeacherId}`);
          });

          // Clean up audio
          teachersWithAudioEnabled.delete(currentTeacherId);
          io.to(`teacher-${currentTeacherId}`).emit('stopAudioStream', {
            teacherId: currentTeacherId
          });

          liveTeachers.delete(currentTeacherId);
          if (currentLiveTeacher === currentTeacherId) {
            currentLiveTeacher = null;
          }
        }
      }
    }
  });
});

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

const PORT = process.env.PORT || 5000;

httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});