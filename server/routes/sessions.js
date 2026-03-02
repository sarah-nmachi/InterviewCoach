const express = require('express');
const { getSessionsByUser, getSessionById } = require('../services/cosmosDb');

const router = express.Router();

/**
 * GET /api/sessions/:userId
 * Get all sessions for a user
 */
router.get('/:userId', async (req, res) => {
  try {
    const sessions = await getSessionsByUser(req.params.userId);
    res.json({ sessions });
  } catch (err) {
    console.error('Get sessions error:', err);
    res.status(500).json({ error: 'Failed to retrieve sessions', details: err.message });
  }
});

/**
 * GET /api/sessions/:userId/:sessionId
 * Get a specific session
 */
router.get('/:userId/:sessionId', async (req, res) => {
  try {
    const session = await getSessionById(req.params.sessionId, req.params.userId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    res.json({ session });
  } catch (err) {
    console.error('Get session error:', err);
    res.status(500).json({ error: 'Failed to retrieve session', details: err.message });
  }
});

module.exports = router;
