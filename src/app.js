// src/app.js
const express = require('express');
const cors = require('cors');

const app = express();

app.use(cors());
app.use(express.json());

// rotas
const authRoutes = require('./routes/authRoutes');
const clientRoutes = require('./routes/clientRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');

// 🔐 middleware de auth
const authMiddleware = require('./middlewares/authMiddleware');

// 👉 públicas (sem token)
app.use('/auth', authRoutes);

// 👉 protegidas (precisam de Bearer token; popula req.user)
app.use('/clients', authMiddleware, clientRoutes);
app.use('/analytics', authMiddleware, analyticsRoutes);

module.exports = app;
