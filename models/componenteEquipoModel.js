'use strict';

const { query } = require('../config/database');

/**
 * Acceso a datos asíncrono de `componente_equipo` para PostgreSQL.
 */

async function listarPorEquipo(equipoId) {
  const res = await query('SELECT * FROM componente_equipo WHERE equipo_id = $1 ORDER BY id', [equipoId]);
  return res.rows;
}

async function buscar(equipoId, nombre) {
  const res = await query('SELECT * FROM componente_equipo WHERE equipo_id = $1 AND nombre = $2', [equipoId, nombre]);
  return res.rows[0] || null;
}

/** Crea (o ignora si ya existe) un componente de un equipo. */
async function crear({ equipoId, nombre, estado = 'bueno', observacion = null, actualizadoPorId = null }) {
  await query(
    `INSERT INTO componente_equipo (equipo_id, nombre, estado, observacion, actualizado_por_id)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (equipo_id, nombre) DO NOTHING`,
    [equipoId, nombre, estado, observacion, actualizadoPorId]
  );
  return buscar(equipoId, nombre);
}

/** Actualiza el estado/observacion de un componente (edicion por TIC). */
async function actualizarEstado({ equipoId, nombre, estado, observacion = null, actualizadoPorId = null }) {
  await query(
    `UPDATE componente_equipo
     SET estado = $1, observacion = $2, actualizado_en = CURRENT_TIMESTAMP, actualizado_por_id = $3
     WHERE equipo_id = $4 AND nombre = $5`,
    [estado, observacion, actualizadoPorId, equipoId, nombre]
  );
  return buscar(equipoId, nombre);
}

module.exports = { listarPorEquipo, buscar, crear, actualizarEstado };