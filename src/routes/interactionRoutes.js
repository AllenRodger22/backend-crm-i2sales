const express = require('express');
const router = express.Router({ mergeParams: true });
const interactionController = require('../controllers/interactionController');

router.post('/', interactionController.create);      // POST /clients/:clientId/interactions
router.get('/', interactionController.listByClient); // GET  /clients/:clientId/interactions

module.exports = router;
