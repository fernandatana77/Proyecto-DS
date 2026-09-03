'use strict';

const { obtenerConexion } = require('../config/database');

/** Acceso a datos de la tabla `empleado`. Solo SQL, sin logica de negocio. */

function buscarPorId(id) {
  return obtenerConexion().prepare('SELECT * FROM empleado WHERE id = ?').get(id);
}

/** Login de empleado: se busca directamente por el hash del PIN (ver utils/hash.js). */
function buscarActivoPorHashPin(pinHash) {
  return obtenerConexion()
    .prepare('SELECT * FROM empleado WHERE pin_hash = ? AND activo = 1')
    .get(pinHash);
}

function buscarPorCedula(cedula) {
  return obtenerConexion().prepare('SELECT * FROM empleado WHERE cedula = ?').get(cedula);
}

function listar() {
  return obtenerConexion().prepare('SELECT * FROM empleado ORDER BY apellidos, nombres').all();
}

function crear({ cedula, nombres, apellidos, correo, cargo, sede, pinHash, activo = 1 }) {
  const info = obtenerConexion()
    .prepare(
      `INSERT INTO empleado (cedula, nombres, apellidos, correo, cargo, sede, pin_hash, activo)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(cedula, nombres, apellidos, correo ?? null, cargo ?? null, sede, pinHash, activo ? 1 : 0);
  return buscarPorId(Number(info.lastInsertRowid));
}

module.exports = { buscarPorId, buscarActivoPorHashPin, buscarPorCedula, listar, crear };
