'use strict';

const express = require('express');
const authController = require('../controllers/authController');
const { rateLimitPIN } = require('../middlewares/rateLimitPIN');

const router = express.Router();

// HU01 - login de empleado SOLO con PIN. rateLimitPIN aplica RNF05.
router.post('/pin', rateLimitPIN, authController.loginPin);

// RF01 - login de Admin / Tecnico con usuario + contrasena.
router.post('/login', authController.loginStaff);

module.exports = router;
