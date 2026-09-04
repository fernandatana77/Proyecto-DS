'use strict';

const express = require('express');
const dashboardController = require('../controllers/dashboardController');
const authJWT = require('../middlewares/authJWT');

const router = express.Router();

// HU05 - el dashboard es para el rol Administrador.
router.get('/', authJWT(['Admin']), dashboardController.obtener);

module.exports = router;
