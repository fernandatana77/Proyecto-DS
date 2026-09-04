'use strict';

const express = require('express');
const bitacoraController = require('../controllers/bitacoraController');
const authJWT = require('../middlewares/authJWT');

const router = express.Router();

// HU06 / RNF02 / RN03: la bitacora es de SOLO LECTURA y solo para el Administrador.
const soloAdmin = authJWT(['Admin']);

router.get('/acciones', soloAdmin, bitacoraController.acciones);
router.get('/', soloAdmin, bitacoraController.listar);

module.exports = router;
