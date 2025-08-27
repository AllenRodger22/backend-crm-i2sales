// src/config/database.js
const { Pool } = require('pg');
require('dotenv').config();

const hasUrl = !!process.env.DATABASE_URL;
const isSupabaseHost = (h) => /supabase\.co$/i.test(h || '');

let config;

if (hasUrl) {
  // MODO 1: CONNECTION STRING ÚNICA
  const url = process.env.DATABASE_URL;
  const needsSSL =
    process.env.PGSSL === 'require' ||
    /sslmode=require/i.test(url) ||
    /supabase\.co/i.test(url);

  config = {
    connectionString: url,
    ssl: needsSSL ? { rejectUnauthorized: false } : false,
  };
} else {
  // MODO 2: CAMPOS SOLTOS
  const host = process.env.DB_HOST;
  const port = Number(process.env.DB_PORT || 5432);
  const database = process.env.DB_NAME || process.env.DB_DATABASE || 'postgres';
  const user = process.env.DB_USER || 'postgres';
  const password = process.env.DB_PASSWORD; // aqui NÃO precisa URL-encode

  const needsSSL =
    process.env.PGSSL === 'require' || isSupabaseHost(host);

  config = {
    host,
    port,
    database,
    user,
    password,
    ssl: needsSSL ? { rejectUnauthorized: false } : false,
  };
}

// opções adicionais (bons defaults)
config.max = 10;
config.idleTimeoutMillis = 30000;
config.connectionTimeoutMillis = 10000;
config.keepAlive = true;

const pool = new Pool(config);

// loga erros de conexões ociosas
pool.on('error', (err) => {
  console.error('[PG POOL ERROR]', err.message);
});

async function ping() {
  const client = await pool.connect();
  try {
    const r = await client.query('SELECT now() as now');
    return r.rows[0].now;
  } finally {
    client.release();
  }
}

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
  ping,
};
