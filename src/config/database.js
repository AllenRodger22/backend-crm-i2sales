// src/config/database.js
const { Pool } = require('pg');
require('dotenv').config();

const url = process.env.DATABASE_URL || '';
const needsSSL =
  process.env.PGSSL === 'require' ||
  /\b(supabase|neon|render|timescaledb|aws|azure)\b/i.test(url) ||
  /sslmode=require/i.test(url);

const pool = new Pool({
  connectionString: url,
  ssl: needsSSL ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  keepAlive: true,
});

// loga qualquer erro de conexão/idle
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
