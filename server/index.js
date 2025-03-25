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

// NEW: Track audio status separately from live status
const teacherAudioStatus = new Map(); // teacherId -> boolean (audio enabled)

// Global map to store audio data temporarily
const audioDataMap = new Map();

// Middleware
app.use(cors({
  origin: allowedOrigins,
  credentials: true
}));
// Increase payload limit for audio data
app.use(express.json({ limit: '50mb' }));

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
    console.log('Client checking teacher status');
    // Send current live teacher to the requesting client
    if (currentLiveTeacher) {
      console.log('Informing client about active teacher:', currentLiveTeacher);
      socket.emit('teacherOnline', {
        teacherId: currentLiveTeacher,
        timestamp: Date.now()
      });

      // Also send current audio status if available
      if (teacherAudioStatus.has(currentLiveTeacher)) {
        console.log('Sending current audio status:', teacherAudioStatus.get(currentLiveTeacher));
        socket.emit('audioToggle', {
          teacherId: currentLiveTeacher,
          enabled: teacherAudioStatus.get(currentLiveTeacher)
        });
      }
    }
  });

  socket.on('startLive', (teacherId) => {
    if (currentLiveTeacher && currentLiveTeacher !== teacherId) {
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

    // Notify all clients with timestamp
    io.emit('teacherOnline', {
      teacherId,
      timestamp: Date.now()
    });
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

      // Also clear audio status when session ends
      teacherAudioStatus.delete(teacherId);

      // Notify all clients with timestamp
      io.emit('teacherOffline', {
        teacherId,
        timestamp: Date.now()
      });
    }

    if (currentTeacherId === teacherId) {
      socket.leave(`teacher-${teacherId}`);
      currentTeacherId = null;
    }
  });

  // MODIFIED: standardize on audioToggle for both incoming and outgoing events
  socket.on('audioToggle', (data) => {
    console.log('Teacher audio toggle event received:', data.teacherId, data.enabled);

    // Store audio status separately from live status
    teacherAudioStatus.set(data.teacherId, data.enabled);

    // Broadcast to all students in the teacher's room
    socket.broadcast.to(`teacher-${data.teacherId}`).emit('audioToggle', {
      teacherId: data.teacherId,
      enabled: data.enabled
    });
  });

  // For backwards compatibility - redirect to standardized event
  socket.on('toggleAudio', (data) => {
    console.log('Received deprecated toggleAudio event, forwarding to audioToggle');
    socket.emit('audioToggle', data);
  });

  // Handle audio data from teacher
  socket.on('audioData', (data) => {
    console.log('Audio data received from teacher:', data.teacherId);
    audioDataMap.set(data.teacherId, data.audioData);

    // Notify students that audio is available for this session
    socket.broadcast.to(`teacher-${data.teacherId}`).emit('audioAvailable', {
      teacherId: data.teacherId
    });
  });

  // Handle session ended with audio info
  socket.on('sessionEnded', (data) => {
    console.log('Session ended with audio info:', data);
    // Broadcast to all students in the room that the session has ended with audio info
    socket.broadcast.to(`teacher-${data.teacherId}`).emit('sessionEnded', data);
  });

  socket.on('joinTeacherRoom', (teacherId) => {
    if (liveTeachers.has(teacherId)) {
      console.log('Student joined teacher room:', teacherId);
      socket.join(`teacher-${teacherId}`);
      liveTeachers.get(teacherId).add(socket);
      isStudent = true;
      currentTeacherId = teacherId;

      // Send a single teacherOnline event to the joining student with timestamp
      socket.emit('teacherOnline', {
        teacherId,
        timestamp: Date.now()
      });

      // Also send current audio status if available
      if (teacherAudioStatus.has(teacherId)) {
        console.log('Sending current audio status to joining student:', teacherAudioStatus.get(teacherId));
        socket.emit('audioToggle', {
          teacherId: teacherId,
          enabled: teacherAudioStatus.get(teacherId)
        });
      }
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
    // Don't log every update to reduce console noise
    // console.log('Whiteboard update from teacher:', data.teacherId);

    // Broadcast to all students in the room except the sender
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

          // Also clear audio status when teacher disconnects
          teacherAudioStatus.delete(currentTeacherId);

          // Notify all clients with timestamp
          io.emit('teacherOffline', {
            teacherId: currentTeacherId,
            timestamp: Date.now()
          });
        }
      }
    }
  });
});

// Improved audio data route to handle potential errors more gracefully
app.get('/api/audio/:teacherId', async (req, res) => {
  try {
    const { teacherId } = req.params;

    // Check if audio data exists for this teacher
    if (!audioDataMap.has(teacherId)) {
      return res.status(404).json({ message: 'No audio recording found for this session' });
    }

    // Get the audio data
    const audioData = audioDataMap.get(teacherId);

    // Check if the data is in the expected format
    if (!audioData || !audioData.includes(',')) {
      return res.status(400).json({ message: 'Invalid audio data format' });
    }

    try {
      // Create buffer from base64 data
      const base64Data = audioData.split(',')[1]; // Remove the data URL prefix
      const buffer = Buffer.from(base64Data, 'base64');

      // Set response headers
      res.setHeader('Content-Type', 'audio/webm');
      res.setHeader('Content-Disposition', `attachment; filename="session-${teacherId}-audio.webm"`);

      // Send the audio file
      res.send(buffer);
    } catch (error) {
      console.error('Error processing audio data:', error);
      res.status(500).json({ message: 'Error processing audio data', error: error.message });
    }
  } catch (error) {
    console.error('Error retrieving audio data:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

const PORT = process.env.PORT || 5000;

httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});