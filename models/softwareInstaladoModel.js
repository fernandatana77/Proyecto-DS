'use strict';

const { obtenerConexion } = require('../config/database');

/** Acceso a datos de `software_instalado`. (Se usa en el detalle de equipo / HU05.) */

function listarPorEquipo(equipoId) {
  return obtenerConexion()
    .prepare('SELECT * FROM software_instalado WHERE equipo_id = ? ORDER BY nombre')
    .all(equipoId);
}

function crear({ equipoId, nombre, version = null, licencia = null }) {
  const info = obtenerConexion()
    .prepare(
      `INSERT INTO software_instalado (equipo_id, nombre, version, licencia)
       VALUES (?, ?, ?, ?)`
    )
    .run(equipoId, nombre, version, licencia);
  return obtenerConexion()
    .prepare('SELECT * FROM software_instalado WHERE id = ?')
    .get(Number(info.lastInsertRowid));
}

module.exports = { listarPorEquipo, crear };
