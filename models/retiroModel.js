'use strict';

const { obtenerConexion } = require('../config/database');

/** Acceso a datos de `retiro` (cabecera del carrito). Solo SQL. */

function buscarPorId(id) {
  return obtenerConexion().prepare('SELECT * FROM retiro WHERE id = ?').get(id);
}

/** Crea la cabecera del retiro ya aceptada por PIN (RN02). */
function crear({ empleadoId, observaciones = null }) {
  const info = obtenerConexion()
    .prepare(
      `INSERT INTO retiro (empleado_id, estado, aceptado_con_pin, fecha_aceptacion, observaciones)
       VALUES (?, 'Activo', 1, datetime('now'), ?)`
    )
    .run(empleadoId, observaciones);
  return buscarPorId(Number(info.lastInsertRowid));
}

function actualizarEstado(id, estado) {
  obtenerConexion().prepare('UPDATE retiro SET estado = ? WHERE id = ?').run(estado, id);
  return buscarPorId(id);
}

/** Retiros de un empleado con sus equipos (para "mis retiros"). */
function listarPorEmpleadoConEquipos(empleadoId) {
  const retiros = obtenerConexion()
    .prepare('SELECT * FROM retiro WHERE empleado_id = ? ORDER BY fecha_retiro DESC')
    .all(empleadoId);

  const stmtEquipos = obtenerConexion().prepare(
    `SELECT p.id AS prestamo_id, p.estado AS prestamo_estado, p.fecha_devolucion_real,
            e.codigo_interno, e.nombre, e.categoria
     FROM prestamo p JOIN equipo e ON e.id = p.equipo_id
     WHERE p.retiro_id = ? ORDER BY e.categoria`
  );
  return retiros.map((r) => ({ ...r, equipos: stmtEquipos.all(r.id) }));
}

module.exports = { buscarPorId, crear, actualizarEstado, listarPorEmpleadoConEquipos };
