import express from 'express';
import { auth, studentAuth } from '../middleware/auth.js';
import Session from '../models/Session.js';

const router = express.Router();

// Create a new session
router.post('/', auth, studentAuth, async (req, res) => {
  try {
    const { teacherId, videoUrl, whiteboardData } = req.body;
    const session = new Session({
      teacherId,
      studentId: req.user.userId, // This ensures the session is tied to the current student
      videoUrl,
      whiteboardData,
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