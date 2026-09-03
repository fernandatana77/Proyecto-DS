'use strict';

const { obtenerConexion } = require('../config/database');

/** Acceso a datos de `mantenimiento`. (Se completa junto con HU04 / HU05.) */

function buscarPorId(id) {
  return obtenerConexion().prepare('SELECT * FROM mantenimiento WHERE id = ?').get(id);
}

function listarPorEquipo(equipoId) {
  return obtenerConexion()
    .prepare('SELECT * FROM mantenimiento WHERE equipo_id = ? ORDER BY fecha_inicio DESC')
    .all(equipoId);
}

function crear({ equipoId, tipo, descripcion, costo = 0, realizadoPor = null }) {
  const info = obtenerConexion()
    .prepare(
      `INSERT INTO mantenimiento (equipo_id, tipo, descripcion, costo, realizado_por)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(equipoId, tipo, descripcion, costo, realizadoPor);
  return buscarPorId(Number(info.lastInsertRowid));
}

module.exports = { buscarPorId, listarPorEquipo, crear };
