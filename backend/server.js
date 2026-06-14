const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
// Support comma-separated origins e.g. "http://localhost:5173,http://localhost:5174"
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173')
  .split(',').map(o => o.trim());
app.use(cors({ origin: allowedOrigins }));
app.use(express.json());

// Routes
app.use('/api/auth',      require('./routes/auth'));
app.use('/api/auth',      require('./routes/password-reset'));
app.use('/api/profile',   require('./routes/profile'));
app.use('/api/records',   require('./routes/records'));
app.use('/api/analytics', require('./routes/analytics'));
app.use('/api/users',     require('./routes/users'));
app.use('/api/viable',    require('./routes/viable'));
app.use('/api/surface',   require('./routes/surface'));

app.get('/api/health', (_req, res) => res.json({ status: 'ok', ts: new Date() }));

// Error handler
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ message: err.message || 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`🚀 EHA Backend running on http://localhost:${PORT}`);
});
