'use strict';

const { obtenerConexion } = require('../config/database');

/**
 * Acceso a datos de `componente_equipo` (estado fisico por componente,
 * mantenido por TIC). Solo SQL, sin logica de negocio.
 */

function listarPorEquipo(equipoId) {
  return obtenerConexion()
    .prepare('SELECT * FROM componente_equipo WHERE equipo_id = ? ORDER BY id')
    .all(equipoId);
}

function buscar(equipoId, nombre) {
  return obtenerConexion()
    .prepare('SELECT * FROM componente_equipo WHERE equipo_id = ? AND nombre = ?')
    .get(equipoId, nombre);
}

/** Crea (o ignora si ya existe) un componente de un equipo. */
function crear({ equipoId, nombre, estado = 'bueno', observacion = null, actualizadoPorId = null }) {
  obtenerConexion()
    .prepare(
      `INSERT OR IGNORE INTO componente_equipo (equipo_id, nombre, estado, observacion, actualizado_por_id)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(equipoId, nombre, estado, observacion, actualizadoPorId);
  return buscar(equipoId, nombre);
}

/** Actualiza el estado/observacion de un componente (edicion por TIC). */
function actualizarEstado({ equipoId, nombre, estado, observacion = null, actualizadoPorId = null }) {
  obtenerConexion()
    .prepare(
      `UPDATE componente_equipo
       SET estado = ?, observacion = ?, actualizado_en = datetime('now'), actualizado_por_id = ?
       WHERE equipo_id = ? AND nombre = ?`
    )
    .run(estado, observacion, actualizadoPorId, equipoId, nombre);
  return buscar(equipoId, nombre);
}

module.exports = { listarPorEquipo, buscar, crear, actualizarEstado };
