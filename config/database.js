'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');

const config = require('./config');

let db = null;

/** Devuelve la conexion unica a SQLite, abriendola la primera vez. */
function obtenerConexion() {
  if (db) return db;

  const ruta = config.rutaBaseDatos;
  if (ruta !== ':memory:') {
    const directorio = path.dirname(path.resolve(ruta));
    fs.mkdirSync(directorio, { recursive: true });
  }

  db = new DatabaseSync(ruta);
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA journal_mode = WAL;');
  return db;
}

/**
 * Ejecuta `fn` dentro de una transaccion. Hace COMMIT si termina bien y
 * ROLLBACK si lanza. Devuelve lo que devuelva `fn`.
 */
function enTransaccion(fn) {
  const conexion = obtenerConexion();
  conexion.exec('BEGIN');
  try {
    const resultado = fn(conexion);
    conexion.exec('COMMIT');
    return resultado;
  } catch (error) {
    conexion.exec('ROLLBACK');
    throw error;
  }
}

/** Cierra la conexion (util en tests). */
function cerrarConexion() {
  if (db) {
    db.close();
    db = null;
  }
}

module.exports = { obtenerConexion, enTransaccion, cerrarConexion };
