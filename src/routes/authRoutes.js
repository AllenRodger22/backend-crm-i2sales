// Exemplo de um arquivo de rotas (ex: src/routes/authRoutes.js)

const express = require('express');
const router = express.Router();

// Aqui está a importação do seu controller!
const authController = require('../controllers/authController');

// E aqui estão as rotas sendo definidas:
// A rota para login usa o método POST e o controller 'login'
router.post('/login', authController.login);

// E AQUI ESTÁ A SUA RESPOSTA!
// A rota para registro usa o método POST e o controller 'register'
router.post('/register', authController.register);

module.exports = router;