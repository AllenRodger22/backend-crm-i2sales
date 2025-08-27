// src/middlewares/authMiddleware.js
const jwt = require('jsonwebtoken');

module.exports = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Acesso negado. Nenhum token fornecido.' });
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
    res.status(401).json({ error: 'Token inválido.' });
  }
};
