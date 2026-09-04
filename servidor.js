'use strict';

const config = require('./config/config');
const { obtenerConexion } = require('./config/database');
const { ejecutarMigraciones } = require('./models/esquema');
const { sembrarDatosDemo } = require('./scripts/seed');
const { crearApp } = require('./app');

/** Si la BD no tiene ningun usuario de staff, se considera "vacia". */
function baseDatosVacia() {
  return obtenerConexion().prepare('SELECT COUNT(*) AS n FROM usuario_sistema').get().n === 0;
}

function iniciar() {
  obtenerConexion();
  ejecutarMigraciones();

  // En un deploy nuevo la BD arranca vacia: cargar datos demo para que el
  // sistema sea usable de inmediato. Se desactiva con SEMBRAR_DEMO=off.
  if (config.sembrarDemoSiVacia && baseDatosVacia()) {
    console.log('Base de datos vacia: cargando datos demo...');
    const r = sembrarDatosDemo({ recrear: false });
    console.log(`  Datos demo cargados: ${r.empleados} empleados, ${r.staff} staff, ${r.equipos} equipos.`);
  }

  const app = crearApp();
  app.listen(config.puerto, () => {
    const base = config.esProduccion ? `puerto ${config.puerto}` : `http://localhost:${config.puerto}`;
    console.log(`Sistema de Inventario TIC (${config.entorno}) escuchando en ${base}`);
    console.log('  Health check: GET /api/salud');
  });
}

iniciar();
