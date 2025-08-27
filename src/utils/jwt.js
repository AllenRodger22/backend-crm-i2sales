// src/utils/jwt.js
// Centralized helper to obtain JWT secret.
// In production, JWT_SECRET must be provided via environment variables.
// In development, a weak default is used to avoid crashes but warns the user.
const getJwtSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (secret && secret.length > 0) return secret;

  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET não está definido no ambiente de produção.');
  }

  console.warn(
    'WARNING: JWT_SECRET não definido ou vazio. Usando uma chave INSEGURA de desenvolvimento. NÃO use isso em produção.'
  );
  return 'pikachu';
};

module.exports = { getJwtSecret };
