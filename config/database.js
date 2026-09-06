'use strict';

const { Pool } = require('pg');
const config = require('./config');

let pool = null;

/** Devuelve el pool único de conexiones a PostgreSQL. */
function obtenerPool() {
  if (pool) return pool;

  const connectionString = process.env.DATABASE_URL || config.rutaBaseDatos;

  pool = new Pool({
    connectionString,
    // En Render y entornos de producción en la nube se requiere SSL
    ssl: process.env.NODE_ENV === 'production' || process.env.DATABASE_URL?.includes('render.com')
      ? { rejectUnauthorized: false }
      : false
  });

  return pool;
}

/** Ejecuta una consulta SQL en PostgreSQL utilizando el pool. */
async function query(text, params) {
  const p = obtenerPool();
  return await p.query(text, params);
}

/** Ejecuta una función dentro de una transacción en PostgreSQL. */
async function enTransaccion(fn) {
  const p = obtenerPool();
  const cliente = await p.connect();
  try {
    await cliente.query('BEGIN');
    const resultado = await fn(cliente);
    await cliente.query('COMMIT');
    return resultado;
  } catch (error) {
    await cliente.query('ROLLBACK');
    throw error;
  } finally {
    cliente.release();
  }
}

/** Cierra el pool de conexiones (útil en pruebas). */
async function cerrarConexion() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

module.exports = { obtenerPool, query, enTransaccion, cerrarConexion };