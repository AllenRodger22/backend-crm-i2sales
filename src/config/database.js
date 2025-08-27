// src/config/database.js
const { Pool } = require('pg');
const dns = require('dns');
require('dotenv').config();

// Log seguro (nunca logar senhas)
const log = (...args) => console.log('[DB]', ...args);
const warn = (...args) => console.warn('[DB]', ...args);
const err = (...args) => console.error('[DB]', ...args);

// 1) Tenta priorizar IPv4 (nem sempre o host respeita)
try { dns.setDefaultResultOrder('ipv4first'); } catch (_) {}

const isProd = process.env.NODE_ENV === 'production';
const rawUrl = process.env.DATABASE_URL || '';

const mustUseSSL =
  isProd ||
  /\bsslmode=require\b/i.test(rawUrl) ||
  String(process.env.PGSSL).toLowerCase() === 'require';

// Constrói config a partir da URL OU das variáveis soltas
const toConfigFromUrl = (urlStr) => {
  const u = new URL(urlStr);
  return {
    host: u.hostname,
    port: Number(u.port || 5432),
    database: decodeURIComponent(u.pathname.replace(/^\//, '')) || 'postgres',
    user: decodeURIComponent(u.username || 'postgres'),
    password: decodeURIComponent(u.password || ''),
  };
};

const baseConfig = rawUrl
  ? toConfigFromUrl(rawUrl)
  : {
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT) || 5432,
      database: process.env.DB_NAME || 'postgres',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || '',
    };

// 2) Resolve o hostname do Supabase para IPv4 (A) e usa o IP direto
async function resolveIPv4Host(host) {
  try {
    const A = await dns.promises.resolve4(host);
    if (Array.isArray(A) && A.length > 0) {
      log('Hostname resolvido (A/IPv4):', host, '→', A[0]);
      return A[0]; // pega o primeiro A
    }
    warn('Sem A records (IPv4) para', host, '- usando host original');
    return host;
  } catch (e) {
    warn('Falha ao resolver IPv4 para', host, '-', e.message, '- usando host original');
    return host;
  }
}

let pool;

// Inicializa o pool com IPv4 “forçado”
async function initPool() {
  const hostIPv4 = await resolveIPv4Host(baseConfig.host);
  const config = {
    host: hostIPv4,                     // ← IP v4 direto
    port: baseConfig.port,
    database: baseConfig.database,
    user: baseConfig.user,
    password: baseConfig.password,
    ssl: mustUseSSL ? { rejectUnauthorized: false } : false,
    keepAlive: true,
    max: Number(process.env.PG_POOL_MAX) || 10,
    idleTimeoutMillis: Number(process.env.PG_IDLE_MS) || 30000,
    connectionTimeoutMillis: Number(process.env.PG_CONNECT_TIMEOUT) || 10000,
  };

  pool = new Pool(config);

  pool.on('connect', () => log('Conectado ao banco de dados (IPv4).'));
  pool.on('error', (e) => err('Erro no cliente ocioso do pool:', e));
}

const ready = initPool();

// Wrapper seguro de query (aguarda o pool estar pronto)
async function query(text, params) {
  await ready;
  return pool.query(text, params);
}

// Healthcheck simples
async function healthcheck() {
  try {
    await ready;
    const { rows } = await pool.query('select now() as ts');
    return { ok: true, ts: rows[0].ts };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

module.exports = { pool: () => pool, query, healthcheck };
