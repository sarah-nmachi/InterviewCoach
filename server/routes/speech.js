const express = require('express');
const router = express.Router();

/**
 * GET /api/speech/token
 * Get a speech token for the client-side Azure Speech SDK
 */
router.get('/token', async (req, res) => {
  try {
    const speechKey = process.env.AZURE_SPEECH_KEY;
    const speechRegion = process.env.AZURE_SPEECH_REGION;

    if (!speechKey || !speechRegion) {
      return res.status(500).json({ error: 'Speech service not configured' });
    }

    // Fetch a token from the Azure Speech token endpoint
    const axios = require('axios');
    const tokenResponse = await axios.post(
      `https://${speechRegion}.api.cognitive.microsoft.com/sts/v1.0/issueToken`,
      null,
      {
        headers: {
          'Ocp-Apim-Subscription-Key': speechKey,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    res.json({
      token: tokenResponse.data,
      region: speechRegion
    });
  } catch (err) {
    console.error('Speech token error:', err);
    res.status(500).json({ error: 'Failed to get speech token', details: err.message });
  }
});

module.exports = router;
