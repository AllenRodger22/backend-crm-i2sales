// src/config/database.js
const { Pool } = require('pg');
require('dotenv').config();

const isProd = process.env.NODE_ENV === 'production';

// This configuration is more robust.
// It uses DATABASE_URL for production (like Render) and falls back to
// individual environment variables for local development, which is a common pattern.
const connectionConfig = process.env.DATABASE_URL
  ? { connectionString: process.env.DATABASE_URL }
  : {
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT) || 5432,
      database: process.env.DB_NAME || 'postgres',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || '',
    };
    
const poolConfig = {
  ...connectionConfig,
  // In production (like on Render), SSL is required.
  // This automatically enables it without needing a separate PGSSL variable, which is more reliable.
  ssl: isProd ? { rejectUnauthorized: false } : undefined,
};

const pool = new Pool(poolConfig);

pool.on('connect', () => {
  console.log('Conectado ao banco de dados!');
});

pool.on('error', (err, client) => {
  console.error('Erro inesperado no cliente ocioso do banco de dados', err);
  // Avoid exiting the process on idle client errors, as the pool can often recover.
});

module.exports = {
  // Uma função wrapper em torno de pool.query para facilitar o uso
  query: (text, params) => pool.query(text, params),
  // Expõe o pool diretamente para operações mais complexas como transações
  pool: pool,
};
