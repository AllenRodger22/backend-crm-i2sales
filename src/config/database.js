// src/config/database.js
const { Pool } = require('pg');
require('dotenv').config();

// Dica: deixe DATABASE_URL com ?sslmode=require no Render/Supabase
const isProd = process.env.NODE_ENV === 'production';
const hasUrl = !!process.env.DATABASE_URL;

const baseConfig = hasUrl
  ? { connectionString: process.env.DATABASE_URL }
  : {
      user: process.env.DB_USER || 'postgres',
      host: process.env.DB_HOST || 'localhost',
      database: process.env.DB_NAME || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
      port: Number(process.env.DB_PORT || 5432),
    };

// Em produção (Supabase/Render), ative SSL.
// Se você já usa ?sslmode=require na URL, isso aqui só reforça.
const sslConfig = isProd
  ? {
      ssl: {
        rejectUnauthorized: false, // Supabase usa CA pública; isso evita choke em ambientes gerenciados
      },
    }
  : {};

const pool = new Pool({ ...baseConfig, ...sslConfig });

pool.on('connect', () => console.log('✅ Conectado ao banco.'));
pool.on('error', (err) => {
  console.error('❌ Erro no pool do Postgres:', err);
  process.exit(1);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
};
