// src/config/database.js
const { Pool } = require('pg');
require('dotenv').config();

const isProd = process.env.NODE_ENV === 'production';

let config;
if (process.env.DATABASE_URL) {
  config = {
    connectionString: process.env.DATABASE_URL,
  };
} else {
  config = {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME || process.env.DB_DATABASE || 'postgres',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
  };
}

if (isProd) {
  config.ssl = { rejectUnauthorized: false };
}

const pool = new Pool(config);

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
