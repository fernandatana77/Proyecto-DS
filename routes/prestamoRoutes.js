'use strict';

const express = require('express');
const prestamoController = require('../controllers/prestamoController');
const authPIN = require('../middlewares/authPIN');
const authJWT = require('../middlewares/authJWT');

const router = express.Router();

const soloStaff = authJWT(['Admin', 'Técnico']);

// --- Empleado (token PIN) ---
// HU04 paso 1: ver mis equipos prestados y avisar que voy a devolver uno.
router.get('/mios-activos', authPIN, prestamoController.listarMiosActivos);
router.post('/:id/solicitar-devolucion', authPIN, prestamoController.solicitarDevolucion);

// --- Staff Admin / Tecnico (JWT) ---
// HU04 paso 2: cola de devoluciones y certificacion de la recepcion.
router.get('/pendientes', soloStaff, prestamoController.listarPendientes);
router.post('/:id/devolucion', soloStaff, prestamoController.registrarDevolucion);

module.exports = router;
