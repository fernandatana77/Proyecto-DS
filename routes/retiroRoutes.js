'use strict';

const express = require('express');
const retiroController = require('../controllers/retiroController');
const authPIN = require('../middlewares/authPIN');

const router = express.Router();

// HU01 - el empleado formaliza su carrito de retiro (token PIN + reingreso de PIN).
router.post('/', authPIN, retiroController.registrar);

// HU02 - retiros del empleado autenticado.
router.get('/mios', authPIN, retiroController.listarMios);

module.exports = router;
