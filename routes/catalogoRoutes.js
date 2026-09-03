'use strict';

const express = require('express');
const catalogoController = require('../controllers/catalogoController');
const autenticacionMixta = require('../middlewares/autenticacionMixta');

const router = express.Router();

// HU02 - el catalogo lo consultan tanto empleados (token PIN) como staff (JWT).
router.get('/', autenticacionMixta, catalogoController.listar);
router.get('/:id', autenticacionMixta, catalogoController.detalle);

module.exports = router;
