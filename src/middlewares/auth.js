// src/middleware/auth.js
const jwt = require('jsonwebtoken');

module.exports = (req, res, next) => {
  const h = req.headers['authorization'];
  if (!h) return res.status(401).json({ error: 'No token provided' });

  const [, token] = h.split(' ');
  jwt.verify(token, process.env.JWT_SECRET, (err, payload) => {
    if (err) return res.status(401).json({ error: 'Invalid or expired token' });

    // payload pode vir como { id, role } ou { user: { id, role } }
    const u = payload.user || payload;
    if (!u?.id) return res.status(401).json({ error: 'Token missing user id' });

    req.user = { id: u.id, role: u.role || 'BROKER' }; // role default segura
    next();
  });
};
