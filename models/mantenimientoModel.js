'use strict';

const { obtenerConexion } = require('../config/database');

/** Acceso a datos de `mantenimiento`. Solo SQL, sin logica de negocio. */

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

/** Registra un mantenimiento ya cerrado (p. ej. TIC finaliza una reparacion). */
function crearFinalizado({ equipoId, tipo = 'Correctivo', descripcion, costo = 0, realizadoPor = null }) {
  const info = obtenerConexion()
    .prepare(
      `INSERT INTO mantenimiento (equipo_id, tipo, descripcion, costo, realizado_por, fecha_fin, estado)
       VALUES (?, ?, ?, ?, ?, datetime('now'), 'Finalizado')`
    )
    .run(equipoId, tipo, descripcion, costo, realizadoPor);
  return buscarPorId(Number(info.lastInsertRowid));
}

module.exports = { buscarPorId, listarPorEquipo, crear, crearFinalizado };
