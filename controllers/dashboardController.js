'use strict';

const DashboardService = require('../services/DashboardService');

/**
 * GET /api/dashboard?categoria=Laptop   (auth: staff con rol Admin)
 * HU05 / RF04 - Indicadores del parque de equipos y vida util.
 */
async function obtener(req, res, next) {
  try {
    const metricas = DashboardService.obtenerMetricas({ categoria: req.query.categoria });
    res.status(200).json(metricas);
  } catch (error) {
    next(error);
  }
}

module.exports = { obtener };
