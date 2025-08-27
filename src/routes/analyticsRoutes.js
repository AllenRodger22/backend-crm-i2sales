const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analyticsController');

// requer req.user populado pelo middleware de auth
router.get('/kpis/broker', analyticsController.getBrokerKpis);
router.get('/productivity', analyticsController.getProductivity);
router.get('/funnel', analyticsController.getFunnelAnalyticsData);

module.exports = router;
