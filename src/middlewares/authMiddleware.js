// src/middlewares/authMiddleware.js
const jwt = require('jsonwebtoken');

const getJwtSecret = () =>
  process.env.JWT_SECRET || 'your_default_secret_key_for_development';

module.exports = (req, res, next) => {
  const authHeader = req.headers.authorization || '';

  if (!authHeader.startsWith('Bearer ')) {
    console.warn(`[${req.id}] Missing auth token`);
    return res
      .status(401)
      .json({ error: 'Acesso negado. Nenhum token fornecido.' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, getJwtSecret());
    req.user = decoded; // Adiciona os dados do usuário (id, role) ao objeto da requisição
    next();
  } catch (error) {
    console.warn(`[${req.id}] Invalid token: ${error.message}`);
    res.status(401).json({ error: 'Token inválido.' });
  }
};