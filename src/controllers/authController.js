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

// Helper to get a valid JWT secret, with a fallback for development.
const getJwtSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (secret && secret.length > 0) return secret;
  console.warn(
    'WARNING: JWT_SECRET environment variable not set or empty. Using a default, insecure key for development. This is NOT safe for production.'
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

    const dbPasswordHash = user.password_hash.trim();
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

    if (!isMatch) {
      return res.status(401).json({ message: 'Credenciais inválidas.' });
    }

    const token = jwt.sign(
      { id: user.id, role: user.role },
      getJwtSecret(),
      { expiresIn: '1d' }
    );

    const userResponse = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    };

    res.status(200).json({ token, user: userResponse });
  } catch (error) {
    console.error(`[${req.id}] Erro de login:`, error);
    return res.status(500).json({
      message: 'Erro de servidor durante o login.',
      detail: error.message,
    });
  }
};

exports.register = async (req, res) => {
  const { name, email, password, role } = req.body || {};

  if (!name || !email || !password || !role) {
    return res
      .status(400)
      .json({ message: 'Nome, email, senha e cargo são obrigatórios.' });
  }

  const validRoles = ['BROKER', 'MANAGER', 'ADMIN'];
  if (!validRoles.includes(role)) {
    return res.status(400).json({ message: 'Cargo especificado é inválido.' });
  }

  const processedEmail = email.trim().toLowerCase();

  try {
    const existingUser = await db.query('SELECT id FROM users WHERE email = $1', [processedEmail]);
    if (existingUser.rows.length > 0) {
      return res.status(409).json({ message: 'Usuário com este email já existe.' });
    }

    const hashedPassword = hashPassword(password);

    const { rows } = await db.query(
      'INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, name, email, role',
      [name, processedEmail, hashedPassword, role]
    );

    res.status(201).json(convertObjectKeys(rows[0], snakeToCamel));
  } catch (error) {
    console.error(`[${req.id}] Erro no registro:`, error);
    res.status(500).json({ message: 'Erro de servidor durante o registro.' });
  }
};

exports.me = async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT id, name, email, role FROM users WHERE id = $1',
      [req.user.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Usuário não encontrado.' });
    }
    res.status(200).json(convertObjectKeys(rows[0], snakeToCamel));
  } catch (error) {
    console.error(`[${req.id}] Erro ao buscar usuário:`, error);
    res.status(500).json({ message: 'Erro de servidor ao buscar usuário.' });
  }
};

