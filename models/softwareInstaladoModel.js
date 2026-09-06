'use strict';

const { query } = require('../config/database');

/** Acceso a datos asíncrono de `software_instalado` para PostgreSQL. */

async function listarPorEquipo(equipoId) {
  const res = await query('SELECT * FROM software_instalado WHERE equipo_id = $1 ORDER BY nombre', [equipoId]);
  return res.rows;
}

async function crear({ equipoId, nombre, version = null, licencia = null }) {
  const res = await query(
    `INSERT INTO software_instalado (equipo_id, nombre, version, licencia)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [equipoId, nombre, version, licencia]
  );
  return res.rows[0];
}

module.exports = { listarPorEquipo, crear };