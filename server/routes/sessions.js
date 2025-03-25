import express from 'express';
import { auth, studentAuth } from '../middleware/auth.js';
import Session from '../models/Session.js';

const router = express.Router();

// Global map to temporarily store audio data
// In a production app, you'd want to use a more persistent solution
const audioDataMap = new Map();

// Store audio data when a session ends
router.post('/audio', auth, async (req, res) => {
  try {
    const { teacherId, audioData } = req.body;

    // Store the audio data
    audioDataMap.set(teacherId, audioData);

    console.log(`Audio data stored for teacher ${teacherId}`);
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error storing audio data:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get audio data for a teacher's session
router.get('/audio/:teacherId', auth, async (req, res) => {
  try {
    const { teacherId } = req.params;

    // Check if audio data exists for this teacher
    if (!audioDataMap.has(teacherId)) {
      return res.status(404).json({ message: 'No audio recording found for this session' });
    }

    // Get the audio data
    const audioData = audioDataMap.get(teacherId);

    // Create buffer from base64 data
    const base64Data = audioData.split(',')[1]; // Remove the data URL prefix
    const buffer = Buffer.from(base64Data, 'base64');

    // Set response headers
    res.setHeader('Content-Type', 'audio/webm');
    res.setHeader('Content-Disposition', `attachment; filename="session-${teacherId}-audio.webm"`);

    // Send the audio file
    res.send(buffer);

    // Optionally, remove the audio data after sending it to save memory
    // In production, consider implementing this based on your needs
    // audioDataMap.delete(teacherId);
  } catch (error) {
    console.error('Error retrieving audio data:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Create a new session
router.post('/', auth, studentAuth, async (req, res) => {
  try {
    const { teacherId, videoUrl, whiteboardData, hasAudio = false } = req.body;
    const session = new Session({
      teacherId,
      studentId: req.user.userId, // This ensures the session is tied to the current student
      videoUrl,
      whiteboardData,
      hasAudio,
      endTime: new Date()
    });
    await session.save();
    res.status(201).json(session);
  } catch (error) {
    console.error('Error saving session:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get student's saved sessions
router.get('/student', auth, studentAuth, async (req, res) => {
  try {
    // Only fetch sessions where studentId matches the current user's ID
    const sessions = await Session.find({ studentId: req.user.userId })
      .populate('teacherId', 'firstName lastName')
      .sort({ createdAt: -1 });
    res.json(sessions);
  } catch (error) {
    console.error('Error fetching sessions:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Delete a session
router.delete('/:id', auth, studentAuth, async (req, res) => {
  try {
    // Only allow deletion if the session belongs to the current student
    const session = await Session.findOne({
      _id: req.params.id,
      studentId: req.user.userId
    });

    if (!session) {
      return res.status(404).json({ message: 'Session not found or unauthorized' });
    }

    await session.deleteOne();
    res.json({ message: 'Session deleted successfully' });
  } catch (error) {
    console.error('Error deleting session:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

export default router;