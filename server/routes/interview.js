const express = require('express');
const { buildSystemContext, chat, requestFeedback } = require('../services/aiFoundry');
const { deleteFiles } = require('../services/blobStorage');
const { saveSession, updateSession } = require('../services/cosmosDb');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();

// In-memory store for active interview sessions
const activeSessions = new Map();

/**
 * POST /api/interview/start
 * Initialize a new interview session
 */
router.post('/start', async (req, res) => {
  try {
    const { cvText, jdText, interviewType, userId, cvBlobName, jdBlobName } = req.body;

    if (!cvText || !jdText || !interviewType) {
      return res.status(400).json({ error: 'CV text, JD text, and interview type are required' });
    }

    const sessionId = uuidv4();
    const systemMessage = buildSystemContext(cvText, jdText, interviewType);
    const messages = [{ role: 'system', content: systemMessage }];

    // Get the first question from the agent
    const agentResponse = await chat(messages);
    messages.push({ role: 'assistant', content: agentResponse });

    // Extract interviewer role from first message (e.g. "I'm Alex, a VP of Marketing at...")
    let interviewerRole = null;
    const roleMatch = agentResponse.match(/I'm\s+\w+,\s+(?:a\s+|an\s+|the\s+)?(.+?)\s+(?:at|here at|with)\s+/i);
    if (roleMatch) {
      interviewerRole = roleMatch[1].trim();
    }

    // Store session in memory
    const session = {
      id: sessionId,
      userId: userId || 'anonymous',
      messages,
      questionCount: 1,
      startedAt: new Date().toISOString(),
      blobNames: [cvBlobName, jdBlobName].filter(Boolean),
      interviewType,
      isActive: true
    };
    activeSessions.set(sessionId, session);

    // Save to Cosmos DB
    try {
      await saveSession({
        id: sessionId,
        userId: session.userId,
        interviewType,
        startedAt: session.startedAt,
        status: 'in-progress',
        createdAt: session.startedAt
      });
    } catch (dbErr) {
      console.warn('Could not save to Cosmos DB:', dbErr.message);
    }

    res.json({
      sessionId,
      message: agentResponse,
      questionCount: 1,
      interviewerRole
    });
  } catch (err) {
    console.error('Interview start error:', err);
    res.status(500).json({ error: 'Failed to start interview', details: err.message });
  }
});

/**
 * POST /api/interview/respond
 * Send a candidate's answer and get the next question
 */
router.post('/respond', async (req, res) => {
  try {
    const { sessionId, answer, timeRemaining } = req.body;

    const session = activeSessions.get(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Add candidate's answer
    session.messages.push({ role: 'user', content: answer });

    // Inject timing cues as system messages
    if (timeRemaining !== undefined) {
      if (timeRemaining <= 120 && timeRemaining > 60) {
        // 2 minutes remaining
        session.messages.push({
          role: 'system',
          content: 'SYSTEM: 2 minutes remaining, move to closing question now. Ask "Do you have any questions for me?" if you haven\'t already.'
        });
      } else if (timeRemaining <= 300 && timeRemaining > 120) {
        // 5 minutes remaining
        session.messages.push({
          role: 'system',
          content: 'SYSTEM: 5 minutes remaining, begin wrapping up. Finish the current question thread and prepare to move toward closing.'
        });
      }
    }

    // Get agent response
    let agentResponse = await chat(session.messages);

    // Check if AI signalled interview is complete
    let interviewComplete = false;
    if (agentResponse.includes('[INTERVIEW_COMPLETE]')) {
      interviewComplete = true;
      agentResponse = agentResponse.replace(/\s*\[INTERVIEW_COMPLETE\]\s*/g, '').trim();
    }

    session.messages.push({ role: 'assistant', content: agentResponse });
    session.questionCount++;

    res.json({
      message: agentResponse,
      questionCount: session.questionCount,
      interviewComplete
    });
  } catch (err) {
    console.error('Interview respond error:', err);
    res.status(500).json({ error: 'Failed to get response', details: err.message });
  }
});

/**
 * POST /api/interview/end
 * End the session and get feedback
 */
router.post('/end', async (req, res) => {
  try {
    const { sessionId, sessionDurationMinutes, endReason } = req.body;

    const session = activeSessions.get(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // If timed out, add the closing message
    if (endReason === 'timeout') {
      session.messages.push({
        role: 'assistant',
        content: "That's our time — thank you so much for coming in today. We'll be in touch."
      });
    }

    // Request structured feedback
    const feedback = await requestFeedback(session.messages, sessionDurationMinutes || 0);
    feedback.session_duration_minutes = sessionDurationMinutes;

    // Cap scores at 40 if interview lasted less than 10 minutes
    if (sessionDurationMinutes < 10) {
      feedback.overall_score = Math.min(feedback.overall_score || 0, 40);
      if (Array.isArray(feedback.question_breakdown)) {
        feedback.question_breakdown.forEach(q => {
          q.score = Math.min(q.score || 0, 40);
        });
      }
      feedback.short_session_notice = 'Score capped: interview lasted less than 10 minutes. A thorough interview typically takes 15–30 minutes.';
    }

    // Save feedback to Cosmos DB
    try {
      await updateSession(sessionId, session.userId, {
        status: 'completed',
        feedback,
        endedAt: new Date().toISOString(),
        totalQuestions: session.questionCount,
        durationMinutes: sessionDurationMinutes
      });
    } catch (dbErr) {
      console.warn('Could not update Cosmos DB:', dbErr.message);
    }

    // Clean up blob storage (privacy)
    if (session.blobNames.length > 0) {
      deleteFiles(session.blobNames).catch(err =>
        console.warn('Blob cleanup error:', err.message)
      );
    }

    // Remove from active sessions
    session.isActive = false;
    activeSessions.delete(sessionId);

    res.json({ feedback });
  } catch (err) {
    console.error('Interview end error:', err);
    res.status(500).json({ error: 'Failed to end interview', details: err.message });
  }
});

/**
 * POST /api/interview/force-end
 * Force end at 30-minute mark
 */
router.post('/force-end', async (req, res) => {
  try {
    const { sessionId, sessionDurationMinutes } = req.body;

    const session = activeSessions.get(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Add the time-up closing message
    session.messages.push({
      role: 'assistant',
      content: "That's our time — thank you so much for coming in today. We'll be in touch."
    });

    const feedback = await requestFeedback(session.messages, sessionDurationMinutes || 30);
    feedback.session_duration_minutes = sessionDurationMinutes || 30;

    try {
      await updateSession(sessionId, session.userId, {
        status: 'completed',
        feedback,
        endedAt: new Date().toISOString(),
        endReason: 'timeout',
        totalQuestions: session.questionCount,
        durationMinutes: sessionDurationMinutes || 30
      });
    } catch (dbErr) {
      console.warn('Could not update Cosmos DB:', dbErr.message);
    }

    if (session.blobNames.length > 0) {
      deleteFiles(session.blobNames).catch(err =>
        console.warn('Blob cleanup error:', err.message)
      );
    }

    activeSessions.delete(sessionId);

    res.json({ feedback });
  } catch (err) {
    console.error('Force end error:', err);
    res.status(500).json({ error: 'Failed to force end interview', details: err.message });
  }
});

/**
 * POST /api/interview/abandon
 * Mark a session as abandoned (called via sendBeacon on page unload)
 */
router.post('/abandon', async (req, res) => {
  try {
    const { sessionId } = req.body;
    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId required' });
    }

    const session = activeSessions.get(sessionId);
    if (session) {
      // Clean up blobs
      if (session.blobNames && session.blobNames.length > 0) {
        deleteFiles(session.blobNames).catch(err =>
          console.warn('Blob cleanup error on abandon:', err.message)
        );
      }

      // Update Cosmos DB
      try {
        await updateSession(sessionId, session.userId, {
          status: 'abandoned',
          endedAt: new Date().toISOString(),
          endReason: 'abandoned',
          totalQuestions: session.questionCount || 0,
          durationMinutes: Math.round((Date.now() - new Date(session.startedAt).getTime()) / 60000)
        });
      } catch (dbErr) {
        console.warn('Could not update Cosmos DB on abandon:', dbErr.message);
      }

      activeSessions.delete(sessionId);
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Abandon error:', err);
    res.status(500).json({ error: 'Failed to abandon session' });
  }
});

module.exports = router;
