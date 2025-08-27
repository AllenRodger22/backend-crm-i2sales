// src/config/database.js
const { Pool } = require('pg');
require('dotenv').config();

/**
 * Prioridade:
 * 1) DATABASE_URL (completa)
 * 2) Variáveis soltas (DB_USER/DB_PASSWORD/DB_HOST/DB_PORT/DB_DATABASE)
 * 3) Fallback local (evite em produção)
 */
const connectionString =
  process.env.DATABASE_URL ||
  (process.env.DB_USER
    ? `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT || 5432}/${process.env.DB_DATABASE}`
    : 'postgresql://postgres:pikachu@localhost:5432/postgres'); // <- apenas dev local

// Supabase normalmente exige SSL; Render/Local podem não exigir.
// Vamos ligar SSL por padrão, mas dá pra desligar com DB_SSL=false.
const useSsl = process.env.DB_SSL === 'false' ? false : { rejectUnauthorized: false };

const pool = new Pool({
  connectionString,
  ssl: useSsl,
  // Esses timeouts evitam request pendurada que vira 500 no login:
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  // Se quiser limitar conexões pra não estourar pool do Supabase:
  max: parseInt(process.env.DB_MAX_CONN || '10', 10),
});

// Logs úteis pra diagnosticar (apenas server-side)
pool.on('connect', () => console.log('[PG] Nova conexão aberta.'));
pool.on('acquire', () => console.log('[PG] Conexão adquirida.'));
pool.on('remove', () => console.log('[PG] Conexão removida.'));
pool.on('error', (err) => console.error('[PG] ERRO no pool:', err));

async function ping() {
  try {
    const r = await pool.query('select now() as ts, current_user, current_schema');
    return r.rows[0];
  } catch (e) {
    console.error('[PG] PING FAIL:', e);
    throw e;
  }
}

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
  ping,
};
