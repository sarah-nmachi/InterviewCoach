// In production (Azure App Service), env vars are set via App Settings
// In development, load from ../.env
if (process.env.NODE_ENV !== 'production') {
  const path = require('path');
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
}
const express = require('express');
const cors = require('cors');
const path = require('path');

const uploadRoutes = require('./routes/upload');
const interviewRoutes = require('./routes/interview');
const sessionRoutes = require('./routes/sessions');
const speechRoutes = require('./routes/speech');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// API Routes
app.use('/api/upload', uploadRoutes);
app.use('/api/interview', interviewRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/speech', speechRoutes);

// Serve React frontend in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../client/dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/dist/index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Interview Coach API running on port ${PORT}`);
});
