import express from 'express';
import { auth } from '../middleware/auth.js';
import Session from '../models/Session.js';

const router = express.Router();

// Create a new session
router.post('/', auth, async (req, res) => {
  try {
    const { teacherId, videoUrl, audioUrl, whiteboardData, startTime, endTime } = req.body;
    const session = new Session({
      teacherId,
      studentId: req.user.userId,
      videoUrl,
      audioUrl,
      whiteboardData,
      startTime: startTime || new Date(),
      endTime: endTime || new Date()
    });
    await session.save();
    res.status(201).json(session);
  } catch (error) {
    console.error('Error saving session:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get all sessions for a user (both as teacher and student)
router.get('/', auth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const sessions = await Session.find({
      $or: [
        { teacherId: userId },
        { studentId: userId }
      ]
    })
    .populate('teacherId', 'firstName lastName')
    .sort({ createdAt: -1 });
    
    res.json(sessions);
  } catch (error) {
    console.error('Error fetching sessions:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Delete a session
router.delete('/:id', auth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const session = await Session.findOne({
      _id: req.params.id,
      $or: [
        { teacherId: userId },
        { studentId: userId }
      ]
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