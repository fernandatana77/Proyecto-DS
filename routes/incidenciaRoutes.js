'use strict';

const express = require('express');
const incidenciaController = require('../controllers/incidenciaController');
const authPIN = require('../middlewares/authPIN');
const authJWT = require('../middlewares/authJWT');

const router = express.Router();
const soloStaff = authJWT(['Admin', 'Técnico']);

// --- Empleado (token PIN): solo describe y consulta sus reportes ---
router.post('/', authPIN, incidenciaController.reportar);
router.get('/mias', authPIN, incidenciaController.listarMias);

// --- Staff Admin / Tecnico (JWT): cola y triage ---
router.get('/', soloStaff, incidenciaController.listar);
router.patch('/:id', soloStaff, incidenciaController.triar);

module.exports = router;
