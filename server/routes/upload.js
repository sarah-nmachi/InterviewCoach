const express = require('express');
const multer = require('multer');
const axios = require('axios');
const { parseDocument } = require('../services/documentIntelligence');
const { uploadFile } = require('../services/blobStorage');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

/**
 * POST /api/upload/cv
 * Upload and parse a CV file (PDF or DOCX)
 */
router.post('/cv', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const allowed = ['application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword'];
    if (!allowed.includes(req.file.mimetype)) {
      return res.status(400).json({ error: 'Only PDF and DOCX files are accepted' });
    }

    // Upload to Blob Storage
    const { blobName } = await uploadFile(req.file.buffer, req.file.originalname);

    // Parse with Document Intelligence
    const extractedText = await parseDocument(req.file.buffer);

    res.json({
      success: true,
      blobName,
      fileName: req.file.originalname,
      extractedText
    });
  } catch (err) {
    console.error('CV upload error:', err);
    res.status(500).json({ error: 'Failed to process CV', details: err.message });
  }
});

/**
 * POST /api/upload/jd
 * Upload a JD file, or provide a URL to fetch
 */
router.post('/jd', upload.single('file'), async (req, res) => {
  try {
    let extractedText = '';
    let blobName = null;

    if (req.file) {
      // File upload path
      const { blobName: bn } = await uploadFile(req.file.buffer, req.file.originalname);
      blobName = bn;
      extractedText = await parseDocument(req.file.buffer);
    } else if (req.body.url) {
      // URL fetch path
      try {
        const response = await axios.get(req.body.url, {
          timeout: 15000,
          headers: { 'User-Agent': 'InterviewCoach/1.0' }
        });
        // Simple HTML to text extraction
        extractedText = response.data
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/&nbsp;/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/\s+/g, ' ')
          .trim();
      } catch (fetchErr) {
        return res.status(400).json({ error: 'Failed to fetch URL', details: fetchErr.message });
      }
    } else if (req.body.text) {
      // Direct text paste
      extractedText = req.body.text;
    } else {
      return res.status(400).json({ error: 'Provide a file, URL, or text' });
    }

    res.json({
      success: true,
      blobName,
      extractedText
    });
  } catch (err) {
    console.error('JD upload error:', err);
    res.status(500).json({ error: 'Failed to process job description', details: err.message });
  }
});

module.exports = router;
