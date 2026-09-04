'use strict';

const express = require('express');
const equipoController = require('../controllers/equipoController');
const authJWT = require('../middlewares/authJWT');

const router = express.Router();

// Cerrar una reparacion la hace TIC (Admin / Tecnico). El Empleado nunca decide
// el estado del equipo.
router.post(
  '/:id/reparacion/finalizar',
  authJWT(['Admin', 'Técnico']),
  equipoController.finalizarReparacion
);

module.exports = router;
