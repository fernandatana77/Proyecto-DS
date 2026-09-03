'use strict';

const path = require('node:path');
const express = require('express');

const rutasApi = require('./routes');
const { noEncontrado, errorHandler } = require('./middlewares/errorHandler');

/** Arma y devuelve la app de Express (sin ponerla a escuchar). */
function crearApp() {
  const app = express();

  app.set('trust proxy', true); // para que req.ip sea correcto detras de proxy
  app.use(express.json({ limit: '100kb' }));
  app.use(express.urlencoded({ extended: false }));

  // PWA (login-pin, catalogo, checklist, dashboard, logs)
  app.use(express.static(path.join(__dirname, 'public')));

  // API REST
  app.use('/api', rutasApi);

  // 404 + manejador central de errores (siempre al final)
  app.use(noEncontrado);
  app.use(errorHandler);

  return app;
}

module.exports = { crearApp };
