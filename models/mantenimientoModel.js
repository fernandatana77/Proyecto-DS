'use strict';

const { query } = require('../config/database');

/** Acceso a datos asíncrono de `mantenimiento` para PostgreSQL. */

async function buscarPorId(id) {
  const res = await query('SELECT * FROM mantenimiento WHERE id = $1', [id]);
  return res.rows[0] || null;
}

async function listarPorEquipo(equipoId) {
  const res = await query('SELECT * FROM mantenimiento WHERE equipo_id = $1 ORDER BY fecha_inicio DESC', [equipoId]);
  return res.rows;
}

async function crear({ equipoId, tipo, descripcion, costo = 0, realizadoPor = null }) {
  const res = await query(
    `INSERT INTO mantenimiento (equipo_id, tipo, descripcion, costo, realizado_por)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [equipoId, tipo, descripcion, costo, realizadoPor]
  );
  return res.rows[0];
}

/** Registra un mantenimiento ya cerrado (p. ej. TIC finaliza una reparacion). */
async function crearFinalizado({ equipoId, tipo = 'Correctivo', descripcion, costo = 0, realizadoPor = null }) {
  const res = await query(
    `INSERT INTO mantenimiento (equipo_id, tipo, descripcion, costo, realizado_por, fecha_fin, estado)
     VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, 'Finalizado')
     RETURNING *`,
    [equipoId, tipo, descripcion, costo, realizadoPor]
  );
  return res.rows[0];
}

module.exports = { buscarPorId, listarPorEquipo, crear, crearFinalizado };