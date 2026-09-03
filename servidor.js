'use strict';

const config = require('./config/config');
const { obtenerConexion } = require('./config/database');
const { ejecutarMigraciones } = require('./models/esquema');
const { crearApp } = require('./app');

function iniciar() {
  obtenerConexion();
  ejecutarMigraciones();

  const app = crearApp();
  app.listen(config.puerto, () => {
    console.log(`Sistema de Inventario TIC (${config.entorno}) escuchando en http://localhost:${config.puerto}`);
    console.log(`  PWA:    http://localhost:${config.puerto}/`);
    console.log(`  API:    http://localhost:${config.puerto}/api/salud`);
  });
}

iniciar();
