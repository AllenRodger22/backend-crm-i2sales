// src/routes/authRoutes.js
const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// Rotas corretas que já devem existir
router.post('/login', authController.login);
router.post('/register', authController.register);

// A linha 9 problemática foi removida
// router.get('/alguma-coisa', authController.funcaoInexistente); // <-- REMOVA ESTA LINHA

module.exports = router;