// src/controllers/authController.js
const db = require('../config/database');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

// AVISO: Usar um 'salt' estático é altamente inseguro e não é recomendado para produção.
const HASH_SEED = 'pikachu';

// Helper para gerar o hash da senha com SHA-256 + salt estático.
const hashPassword = (password) => {
  const hash = crypto.createHash('sha256');
  hash.update(password + HASH_SEED);
  return hash.digest('hex');
};

// Helper para obter o segredo do JWT.
// Em produção: exige JWT_SECRET definido.
// Em dev: avisa e usa uma chave fraca de desenvolvimento.
const getJwtSecret = () => {
  const secret = process.env.JWT_SECRET;

  if (secret && secret.length > 0) {
    return secret;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET não está definido no ambiente de produção.');
  }

  console.warn(
    'WARNING: JWT_SECRET não definido ou vazio. Usando uma chave INSEGURA de desenvolvimento. NÃO use isso em produção.'
  );
  return 'your_default_secret_key_for_development';
};

// Helper to convert snake_case from DB to camelCase for the frontend
const snakeToCamel = (str) =>
  str.replace(/([-_][a-z])/g, (g) => g.toUpperCase().replace('_', ''));

const convertObjectKeys = (obj, converter) => {
  if (obj === null || typeof obj !== 'object' || obj instanceof Date) return obj;
  if (Array.isArray(obj)) return obj.map((item) => convertObjectKeys(item, converter));
  const newObj = {};
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const newKey = converter(key);
      newObj[newKey] = convertObjectKeys(obj[key], converter);
    }
  }
  return newObj;
};

exports.login = async (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ message: 'Email e senha são obrigatórios.' });
  }

  const processedEmail = email.trim().toLowerCase();

  try {
    const { rows } = await db.query('SELECT * FROM users WHERE email = $1', [processedEmail]);
    if (rows.length === 0) {
      return res.status(401).json({ message: 'Credenciais inválidas.' });
    }

    const user = rows[0];

    if (!user.password_hash) {
      return res.status(401).json({ message: 'Credenciais inválidas.' });
    }

    const dbPasswordHash = (user.password_hash || '').trim();
    let isMatch = false;

    if (dbPasswordHash.startsWith('$2')) {
      // bcrypt hash
      const bcrypt = require('bcrypt');
      isMatch = await bcrypt.compare(password, dbPasswordHash);
    } else {
      // sha256 + seed
      const hashedProvidedPassword = hashPassword(password);
      isMatch = hashedProvidedPassword === dbPasswordHash;

      // --- GRACEFUL PASSWORD MIGRATION ---
      if (!isMatch && password === dbPasswordHash) {
        console.log(`[${req.id}] Plaintext password detected for user ${email}. Upgrading hash...`);
        await db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hashedProvidedPassword, user.id]);
        isMatch = true;
      }
      // --- END MIGRATION ---
    }