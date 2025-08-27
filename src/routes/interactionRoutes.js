const express = require('express');
const router = express.Router({ mergeParams: true });
const interactionController = require('../controllers/interactionController');
const authMiddleware = require('../middlewares/authMiddleware');

router.use(authMiddleware);

router.post('/', interactionController.create);      // POST /clients/:clientId/interactions
router.get('/', interactionController.listByClient); // GET  /clients/:clientId/interactions

module.exports = router;
