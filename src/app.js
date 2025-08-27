// src/app.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();

app.use((req, res, next) => {
  req.id = uuidv4();
  console.log(`[${req.id}] ${req.method} ${req.url}`);
  next();
});

app.use(cors());
app.use(express.json());
app.set('trust proxy', 1);

const authRoutes = require('./routes/authRoutes');
const clientRoutes = require('./routes/clientRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const authMiddleware = require('./middlewares/authMiddleware');

const db = require('./config/database');
app.get('/__health', async (req, res) => {
  try {
    const r = await db.query('SELECT current_database() db, now() ts');
    res.json({ ok: true, db: r.rows[0].db, ts: r.rows[0].ts });
  } catch (e) {
    console.error(`[${req.id}] [HEALTH ERROR]`, e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/__echo', (req, res) => {
  res.json({ body: req.body });
});

app.use('/auth', authRoutes);
app.use('/clients', authMiddleware, clientRoutes);
app.use('/analytics', authMiddleware, analyticsRoutes);

app.use((req, res) => {
  res.status(404).json({ message: 'Rota não encontrada' });
});

app.use((err, req, res, next) => {
  console.error(`[${req.id}] [UNCAUGHT ERROR]`, err);
  res
    .status(err.status || 500)
    .json({ message: 'Erro interno do servidor', detail: err.message });
});

module.exports = app;
