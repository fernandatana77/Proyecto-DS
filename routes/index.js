'use strict';

const express = require('express');

const authRoutes = require('./authRoutes');
const catalogoRoutes = require('./catalogoRoutes');
const retiroRoutes = require('./retiroRoutes');
const prestamoRoutes = require('./prestamoRoutes');
const incidenciaRoutes = require('./incidenciaRoutes');
const bitacoraRoutes = require('./bitacoraRoutes');
const dashboardRoutes = require('./dashboardRoutes');

/** Monta todas las rutas de la API. Se cuelga de `/api` en app.js. */
const router = express.Router();

router.get('/salud', (_req, res) => res.json({ estado: 'ok', hora: new Date().toISOString() }));

router.use('/auth', authRoutes);
router.use('/catalogo', catalogoRoutes);
router.use('/retiros', retiroRoutes);
router.use('/prestamos', prestamoRoutes);
router.use('/incidencias', incidenciaRoutes);
router.use('/logs', bitacoraRoutes);
router.use('/dashboard', dashboardRoutes);

// Ruta pendiente (queda para despues de la entrega):
//   /equipos/:id/componentes  -> edicion directa del estado fisico por TIC

module.exports = router;
