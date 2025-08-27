// src/config/database.js
const { Pool } = require('pg');
require('dotenv').config();

// Se quiser hardcodear a URL (não recomendado em produção):
// const connectionString = "postgresql://postgres:[YOUR-PASSWORD]@db.pahyskuhfgequzsvafmq.supabase.co:5432/postgres";

// Melhor: use variável de ambiente
const connectionString = process.env.DATABASE_URL || "postgresql://postgres:pikachu@db.pahyskuhfgequzsvafmq.supabase.co:5432/postgres";

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false }, // Supabase geralmente exige SSL
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
};
