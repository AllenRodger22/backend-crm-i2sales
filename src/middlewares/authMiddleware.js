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
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    // payload pode vir como { id, role } ou { user: { id, role } }
    const u = payload.user || payload;
    if (!u?.id) {
      return res.status(401).json({ error: 'Token sem id de usuário.' });
    }

    req.user = { id: u.id, role: u.role || 'BROKER' };
    next();
  } catch (error) {
    console.warn(`[${req.id}] Invalid token: ${error.message}`);
    res.status(401).json({ error: 'Token inválido.' });
  }
};
