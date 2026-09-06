'use strict';

const { query } = require('../config/database');

/** Acceso a datos asíncrono de la tabla `checklist_estado` para PostgreSQL. */

async function buscarPorId(id) {
  const res = await query('SELECT * FROM checklist_estado WHERE id = $1', [id]);
  return res.rows[0] ? hidratar(res.rows[0]) : null;
}

async function buscarPorPrestamo(prestamoId) {
  const res = await query('SELECT * FROM checklist_estado WHERE prestamo_id = $1 ORDER BY id', [prestamoId]);
  return res.rows.map(hidratar);
}

/**
 * Crea un checklist. `items` es un objeto { pantalla: 'bueno', ... }; se guarda
 * serializado. `tieneDano` lo calcula el service segun las reglas (RN04).
 */
async function crear({ prestamoId = null, tipo, items, observaciones = null, tieneDano = 0, realizadoPorTipo, realizadoPorId = null }) {
  const res = await query(
    `INSERT INTO checklist_estado
       (prestamo_id, tipo, items_json, observaciones, tiene_dano, realizado_por_tipo, realizado_por_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      prestamoId,
      tipo,
      JSON.stringify(items),
      observaciones,
      tieneDano ? 1 : 0,
      realizadoPorTipo,
      realizadoPorId
    ]
  );
  return hidratar(res.rows[0]);
}

/** Asocia un checklist creado antes que el prestamo (mismo flujo transaccional). */
async function asignarPrestamo(id, prestamoId) {
  await query('UPDATE checklist_estado SET prestamo_id = $1 WHERE id = $2', [prestamoId, id]);
}

function hidratar(fila) {
  if (!fila) return null;
  const items = typeof fila.items_json === 'string' ? JSON.parse(fila.items_json) : fila.items_json;
  return { ...fila, items, tiene_dano: Boolean(fila.tiene_dano) };
}

module.exports = { buscarPorId, buscarPorPrestamo, crear, asignarPrestamo };