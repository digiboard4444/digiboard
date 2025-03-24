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
  'http://localhost:5173', // Vite's default port
  'http://localhost:3000'  // Alternative port
];

const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true,
    transports: ['websocket', 'polling'] // Add polling as fallback
  },
  allowEIO3: true, // Enable Engine.IO v3 compatibility
  pingTimeout: 60000, // Increase ping timeout
  pingInterval: 25000 // Increase ping interval
});

// Keep track of live teachers and their sockets
const liveTeachers = new Map(); // teacherId -> Set of student sockets
let currentLiveTeacher = null; // Track the currently live teacher

// Middleware
app.use(cors({
  origin: allowedOrigins,
  credentials: true
}));
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/sessions', sessionRoutes);

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('A user connected');
  let currentTeacherId = null;
  let isStudent = false;

  // Handle teacher status check
  socket.on('checkTeacherStatus', () => {
    // Send current live teacher to the requesting client
    if (currentLiveTeacher) {
      socket.emit('teacherOnline', { teacherId: currentLiveTeacher });
    }
  });

  socket.on('startLive', (teacherId) => {
    if (currentLiveTeacher) {
      // Another teacher is already live
      socket.emit('liveError', {
        message: 'Another teacher is currently live. Please try again later.'
      });
      return;
    }

    console.log('Teacher started live session:', teacherId);
    liveTeachers.set(teacherId, new Set());
    currentTeacherId = teacherId;
    currentLiveTeacher = teacherId;
    socket.join(`teacher-${teacherId}`);
    io.emit('teacherOnline', { teacherId });
  });

  socket.on('stopLive', (teacherId) => {
    console.log('Teacher stopped live session:', teacherId);
    if (liveTeachers.has(teacherId)) {
      const students = liveTeachers.get(teacherId);
      students.forEach(studentSocket => {
        studentSocket.leave(`teacher-${teacherId}`);
      });
      liveTeachers.delete(teacherId);
      if (currentLiveTeacher === teacherId) {
        currentLiveTeacher = null;
      }
      io.emit('teacherOffline', { teacherId });
    }
    if (currentTeacherId === teacherId) {
      socket.leave(`teacher-${teacherId}`);
      currentTeacherId = null;
    }
  });

  socket.on('joinTeacherRoom', (teacherId) => {
    if (liveTeachers.has(teacherId)) {
      console.log('Student joined teacher room:', teacherId);
      socket.join(`teacher-${teacherId}`);
      liveTeachers.get(teacherId).add(socket);
      isStudent = true;
      currentTeacherId = teacherId;
      // Send a single teacherOnline event to the joining student
      socket.emit('teacherOnline', { teacherId });
    }
  });

  socket.on('leaveTeacherRoom', (teacherId) => {
    console.log('Student left teacher room:', teacherId);
    if (liveTeachers.has(teacherId)) {
      liveTeachers.get(teacherId).delete(socket);
    }
    socket.leave(`teacher-${teacherId}`);
    if (currentTeacherId === teacherId) {
      currentTeacherId = null;
    }
  });

  socket.on('whiteboardUpdate', (data) => {
    console.log('Whiteboard update from teacher:', data.teacherId);
    // Broadcast to all student in the room except the sender
    socket.broadcast.to(`teacher-${data.teacherId}`).emit('whiteboardUpdate', data);
  });

  socket.on('disconnect', () => {
    console.log('User disconnected');
    if (currentTeacherId) {
      if (isStudent) {
        // Remove student from teacher list
        if (liveTeachers.has(currentTeacherId)) {
          liveTeachers.get(currentTeacherId).delete(socket);
        }
      } else {
        // If teacher disconnects, clean up their room
        if (liveTeachers.has(currentTeacherId)) {
          const students = liveTeachers.get(currentTeacherId);
          students.forEach(studentSocket => {
            studentSocket.leave(`teacher-${currentTeacherId}`);
          });
          liveTeachers.delete(currentTeacherId);
          if (currentLiveTeacher === currentTeacherId) {
            currentLiveTeacher = null;
          }
          io.emit('teacherOffline', { teacherId: currentTeacherId });
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