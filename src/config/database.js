// src/config/database.js
const { Pool } = require('pg');
const dns = require('dns');
require('dotenv').config();

// ⚙️ Prioriza IPv4 (evita ENETUNREACH quando o host não tem rota IPv6)
try {
  dns.setDefaultResultOrder('ipv4first');
} catch (_) {
  // Node < 18 ignora
}

const isProd = process.env.NODE_ENV === 'production';
const rawUrl = process.env.DATABASE_URL || '';

// Detecta se a URL já pede SSL por querystring
const urlWantsSSL = /\bsslmode=require\b/i.test(rawUrl);

// Decide SSL: em produção SEMPRE usa; em dev só se pedirem explicitamente
const mustUseSSL =
  isProd || urlWantsSSL || String(process.env.PGSSL).toLowerCase() === 'require';

// Monta config de conexão
const connectionConfig = rawUrl
  ? { connectionString: rawUrl }
  : {
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT) || 5432,
      database: process.env.DB_NAME || 'postgres',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || '',
    };

// Pool robusto p/ Render/Supabase
const pool = new Pool({
  ...connectionConfig,
  ssl: mustUseSSL ? { rejectUnauthorized: false } : false,
  keepAlive: true,
  // ajuste fino via env se quiser
  max: Number(process.env.PG_POOL_MAX) || 10,
  idleTimeoutMillis: Number(process.env.PG_IDLE_MS) || 30000,        // 30s
  connectionTimeoutMillis: Number(process.env.PG_CONNECT_TIMEOUT) || 10000, // 10s
});

pool.on('connect', () => {
  console.log('[DB] Conectado ao banco de dados.');
});

pool.on('error', (err) => {
  console.error('[DB] Erro no cliente ocioso do pool:', err);
  // Não derruba o processo; o pool se recupera sozinho
});

// Helper p/ query simples
const query = (text, params) => pool.query(text, params);

// (Opcional) Healthcheck p/ usar em /healthz
const healthcheck = async () => {
  try {
    const { rows } = await pool.query('select now() as ts');
    return { ok: true, ts: rows[0].ts };
  } catch (err) {
    return { ok: false, error: err.message };
  }
};

module.exports = { pool, query, healthcheck };
