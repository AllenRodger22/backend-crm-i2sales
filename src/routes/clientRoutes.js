const express = require('express');
const router = express.Router();

const clientController = require('../controllers/clientController');
const interactionRoutes = require('./interactionRoutes');

// CSV
router.post('/import', clientController.upload.single('file'), clientController.importClients);
router.get('/export', clientController.exportClients);

// Clients CRUD
router.get('/', clientController.getAllClients);
router.post('/', clientController.createClient);
router.get('/:clientId', clientController.getClientById);
router.put('/:clientId', clientController.updateClient);
router.delete('/:clientId', clientController.deleteClient);

// Interactions (aninhadas)
router.use('/:clientId/interactions', interactionRoutes);

module.exports = router;
