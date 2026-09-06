'use strict';

const { query } = require('../config/database');

/** Acceso a datos asíncrono de `retiro` para PostgreSQL. */

async function buscarPorId(id) {
  const res = await query('SELECT * FROM retiro WHERE id = $1', [id]);
  return res.rows[0] || null;
}

/** Crea la cabecera del retiro ya aceptada por PIN. */
async function crear({ empleadoId, observaciones = null }) {
  const res = await query(
    `INSERT INTO retiro (empleado_id, estado, aceptado_con_pin, fecha_aceptacion, observaciones)
     VALUES ($1, 'Activo', 1, CURRENT_TIMESTAMP, $2)
     RETURNING *`,
    [empleadoId, observaciones]
  );
  return res.rows[0];
}

async function actualizarEstado(id, estado) {
  const res = await query(
    'UPDATE retiro SET estado = $1 WHERE id = $2 RETURNING *',
    [estado, id]
  );
  return res.rows[0];
}

/** Retiros de un empleado con sus equipos. */
async function listarPorEmpleadoConEquipos(empleadoId) {
  const resRetiros = await query(
    'SELECT * FROM retiro WHERE empleado_id = $1 ORDER BY fecha_retiro DESC',
    [empleadoId]
  );
  const retiros = resRetiros.rows;

  const sqlEquipos = `
    SELECT p.id AS prestamo_id, p.estado AS prestamo_estado, p.fecha_devolucion_real,
           e.codigo_interno, e.nombre, e.categoria
    FROM prestamo p JOIN equipo e ON e.id = p.equipo_id
    WHERE p.retiro_id = $1 ORDER BY e.categoria`;

  for (const r of retiros) {
    const resEquipos = await query(sqlEquipos, [r.id]);
    r.equipos = resEquipos.rows;
  }

  return retiros;
}

module.exports = { buscarPorId, crear, actualizarEstado, listarPorEmpleadoConEquipos };