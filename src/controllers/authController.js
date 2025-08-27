// src/controllers/authController.js
const db = require('../config/database');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

// Helper para obter o segredo do JWT.
// Em produção: exige JWT_SECRET definido.
// Em dev: avisa e usa uma chave fraca de desenvolvimento.
const getJwtSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (secret && secret.length > 0) return secret;

  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET não está definido no ambiente de produção.');
  }

  console.warn(
    'WARNING: JWT_SECRET não definido ou vazio. Usando uma chave INSEGURA de desenvolvimento. NÃO use isso em produção.'
  );
  return 'pikachu';
};

// Helper: snake_case -> camelCase para o frontend
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

  const processedEmail = String(email).trim().toLowerCase();

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

    // 1) Valida via bcrypt (padrão atual)
    let isMatch = false;
    try {
      isMatch = await bcrypt.compare(password, dbPasswordHash);
    } catch (_e) {
      isMatch = false;
    }

    // 2) Migração graciosa: se falhar e a senha salva for plaintext (legado),
    // atualiza para bcrypt e autentica.
    if (!isMatch && password === dbPasswordHash) {
      console.log(
        `[${req.id || 'auth'}] Plaintext password detected for user ${processedEmail}. Upgrading hash...`
      );
      const newHash = await bcrypt.hash(password, 10);
      await db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, user.id]);
      isMatch = true;
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

    return res.status(200).json({ token, user: userResponse });
  } catch (error) {
    console.error('Erro de login:', error);
    return res.status(500).json({
      message: 'Erro de servidor durante o login.',
      detail: error.message, // ajuda a diagnosticar (ECONNREFUSED, self signed, relation inexistente, etc.)
    });
  }
};

exports.register = async (req, res) => {
  const { name, email, password, role } = req.body || {};

  if (!name || !email || !password || !role) {
    return res.status(400).json({ message: 'Nome, email, senha e cargo são obrigatórios.' });
  }

  const validRoles = ['BROKER', 'MANAGER', 'ADMIN'];
  if (!validRoles.includes(role)) {
    return res.status(400).json({ message: 'Cargo especificado é inválido.' });
  }

  const processedEmail = String(email).trim().toLowerCase();

  try {
    const existingUser = await db.query('SELECT id FROM users WHERE email = $1', [processedEmail]);
    if (existingUser.rows.length > 0) {
      return res.status(409).json({ message: 'Usuário com este email já existe.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const insert = await db.query(
      'INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, name, email, role',
      [name, processedEmail, hashedPassword, role]
    );

    return res.status(201).json({ user: insert.rows[0] });
  } catch (error) {
    console.error('Erro de registro:', error);
    return res.status(500).json({
      message: 'Erro de servidor durante o registro.',
      detail: error.message,
    });
  }
};
