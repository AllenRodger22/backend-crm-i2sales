// src/config/database.js
const { Pool } = require('pg');
require('dotenv').config(); // Garante que as variáveis de ambiente sejam carregadas

// O pool usará automaticamente a variável de ambiente DATABASE_URL
// se estiver disponível. Este é o método padrão para conectar em produção/nuvem.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Se o seu provedor de banco de dados na nuvem exigir SSL, talvez seja necessário descomentar o seguinte:
  // ssl: {
  //   rejectUnauthorized: false
  // }
});

pool.on('connect', () => {
  console.log('Conectado ao banco de dados!');
});

pool.on('error', (err) => {
  console.error('Erro inesperado no cliente ocioso', err);
  process.exit(-1);
});

module.exports = {
  // Uma função wrapper em torno de pool.query para facilitar o uso
  query: (text, params) => pool.query(text, params),
  // Expõe o pool diretamente para operações mais complexas como transações
  pool: pool,
};
