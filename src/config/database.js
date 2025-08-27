// src/config/database.js
const { Pool } = require('pg');
const dns = require('dns');
require('dotenv').config();

// força Node a tentar IPv4 primeiro
dns.setDefaultResultOrder('ipv4first');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // Supabase exige SSL
});

pool.on('connect', () => console.log('✅ Conectado ao banco de dados!'));
pool.on('error', (err) => {
  console.error('💥 Erro inesperado no cliente ocioso', err);
  process.exit(-1);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
};
