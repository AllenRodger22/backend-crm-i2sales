// src/app.js
require('dotenv').config();             // carrega .env o quanto antes
const express = require('express');
const cors = require('cors');

const app = express();

// ===== CORS =====
// Defina no .env (front): FRONTEND_ORIGIN=https://seu-front.com.br
const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  process.env.FRONTEND_ORIGIN,         // opcional (prod)
].filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    // permite tools sem origin (ex.: curl, health) e checa lista p/ browser
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    return cb(new Error(`Origin não permitido: ${origin}`));
  },
  credentials: true,
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
  allowedHeaders: 'Content-Type,Authorization',
}));
app.options('*', cors());               // preflight global

// Body parser
app.use(express.json({ limit: '1mb' }));

// (Render/Heroku atrás de proxy) - opcional
app.set('trust proxy', 1);

// ===== Rotas & middlewares =====
const authRoutes = require('./routes/authRoutes');
const clientRoutes = require('./routes/clientRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const authMiddleware = require('./middlewares/authMiddleware');

// Saúde do serviço (inclui teste de DB)
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

// Públicas
app.use('/auth', authRoutes);

// Protegidas
app.use('/clients', authMiddleware, clientRoutes);
app.use('/analytics', authMiddleware, analyticsRoutes);

// 404
app.use((req, res) => {
  res.status(404).json({ message: 'Rota não encontrada' });
});

// Handler global de erro (último)
app.use((err, req, res, next) => {
  console.error('[UNCAUGHT ERROR]', err);
  const status = err.status || 500;
  res.status(status).json({ message: 'Erro interno do servidor', detail: err.message });
});

module.exports = app;
