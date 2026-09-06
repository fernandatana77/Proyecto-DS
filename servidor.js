'use strict';

const config = require('./config/config');
const { query } = require('./config/database');
const { ejecutarMigraciones } = require('./models/esquema');
const { sembrarDatosDemo } = require('./scripts/seed');
const { crearApp } = require('./app');

/** Si la BD no tiene ningún usuario de staff, se considera "vacía". */
async function baseDatosVacia() {
  const res = await query('SELECT COUNT(*)::int AS n FROM usuario_sistema');
  return res.rows[0].n === 0;
}

async function iniciar() {
  try {
    // 1. Ejecutar migraciones asíncronas en PostgreSQL
    await ejecutarMigraciones();

    // 2. Cargar datos demo si la base de datos está vacía
    const vacia = await baseDatosVacia();
    if (config.sembrarDemoSiVacia && vacia) {
      console.log('Base de datos vacía: cargando datos demo...');
      const r = await sembrarDatosDemo({ recrear: false });
      console.log(`  Datos demo cargados: ${r.empleados} empleados, ${r.staff} staff, ${r.equipos} equipos.`);
    }

    // 3. Iniciar el servidor Express
    const app = crearApp();
    app.listen(config.puerto, () => {
      const base = config.esProduccion ? `puerto ${config.puerto}` : `http://localhost:${config.puerto}`;
      console.log(`Sistema de Inventario TIC (${config.entorno}) escuchando en ${base}`);
      console.log('  Health check: GET /api/salud');
    });
  } catch (error) {
    console.error('Error crítico al iniciar el servidor:', error);
    process.exit(1);
  }
}

iniciar();