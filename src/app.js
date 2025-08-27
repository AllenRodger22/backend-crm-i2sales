// src/app.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();

// 🌍 CORS liberado para todos os domínios (teste)
app.use(cors({
  origin: '*', 
  credentials: true,
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
  allowedHeaders: 'Content-Type,Authorization',
}));
app.options('*', cors()); // preflight

app.use(express.json({ limit: '1mb' }));
app.set('trust proxy', 1);

// ===== Rotas =====
const authRoutes = require('./routes/authRoutes');
const clientRoutes = require('./routes/clientRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const authMiddleware = require('./middlewares/authMiddleware');

// 🔍 Health check (testa conexão com DB)
const db = require('./config/database');
app.get('/health', async (req, res) => {
  try {
    const r = await db.query('SELECT current_database() db, now() ts');
    res.json({ ok: true, db: r.rows[0].db, ts: r.rows[0].ts });
  } catch (e) {
    console.error('[HEALTH ERROR]', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Rotas públicas
app.use('/auth', authRoutes);

// Rotas protegidas
app.use('/clients', authMiddleware, clientRoutes);
app.use('/analytics', authMiddleware, analyticsRoutes);

// 404
app.use((req, res) => {
  res.status(404).json({ message: 'Rota não encontrada' });
});

// Handler global de erros
app.use((err, req, res, next) => {
  console.error('[UNCAUGHT ERROR]', err);
  res.status(err.status || 500).json({ message: 'Erro interno do servidor', detail: err.message });
});

module.exports = app;
