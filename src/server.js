'use strict';

const express = require('express');
const cors = require('cors');

const apiRoutes = require('./routes');
const { ensureFile } = require('./store');

const PORT = process.env.PORT || 4000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:3000';

const app = express();

app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json());

app.use('/api', apiRoutes);

// 404 fallback for unknown routes.
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler (must be last). Reject malformed JSON bodies with a clear 400
// instead of a 500.
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON in request body' });
  }
  // eslint-disable-next-line no-console
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

async function start() {
  await ensureFile();
  app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`Todo API listening on http://localhost:${PORT}`);
    // eslint-disable-next-line no-console
    console.log(`CORS enabled for ${CORS_ORIGIN}`);
  });
}

// Only start automatically when run directly (keeps the app importable in tests).
if (require.main === module) {
  start().catch((err) => {
    // eslint-disable-next-line no-console
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}

module.exports = { app, start };
