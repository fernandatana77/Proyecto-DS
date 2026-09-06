'use strict';

const { query } = require('../config/database');

/** Acceso a datos asíncrono de la tabla `prestamo` para PostgreSQL. */

async function buscarPorId(id) {
  const res = await query('SELECT * FROM prestamo WHERE id = $1', [id]);
  return res.rows[0] || null;
}

/** Vista enriquecida de un prestamo (equipo + empleado). */
async function buscarDetallePorId(id) {
  const res = await query(
    `SELECT p.*,
            e.codigo_interno AS equipo_codigo, e.nombre AS equipo_nombre,
            e.categoria AS equipo_categoria,
            CONCAT(emp.nombres, ' ', emp.apellidos) AS empleado_nombre
     FROM prestamo p
     JOIN equipo e     ON e.id = p.equipo_id
     JOIN empleado emp ON emp.id = p.empleado_id
     WHERE p.id = $1`,
    [id]
  );
  return res.rows[0] || null;
}

async function existePrestamoActivoDeEquipo(equipoId) {
  const res = await query("SELECT 1 FROM prestamo WHERE equipo_id = $1 AND estado = 'Activo' LIMIT 1", [equipoId]);
  return res.rows.length > 0;
}

/** Conteo de prestamos activos que quedan en un retiro (HU04 -> estado del retiro). */
async function contarActivosDeRetiro(retiroId) {
  const res = await query("SELECT COUNT(*)::int AS n FROM prestamo WHERE retiro_id = $1 AND estado = 'Activo'", [retiroId]);
  return res.rows[0].n;
}

async function listarPorEmpleado(empleadoId) {
  const res = await query(
    `SELECT p.*, e.codigo_interno AS equipo_codigo, e.nombre AS equipo_nombre, e.categoria AS equipo_categoria
     FROM prestamo p JOIN equipo e ON e.id = p.equipo_id
     WHERE p.empleado_id = $1 ORDER BY p.fecha_prestamo DESC`,
    [empleadoId]
  );
  return res.rows;
}

/**
 * Inserta un prestamo ya formalizado.
 */
async function crear({ retiroId, empleadoId, equipoId, checklistSalidaId, fechaDevolucionEsperada = null, observaciones = null }) {
  const res = await query(
    `INSERT INTO prestamo
       (retiro_id, empleado_id, equipo_id, estado, aceptado_con_pin, fecha_aceptacion,
        checklist_salida_id, fecha_devolucion_esperada, observaciones)
     VALUES ($1, $2, $3, 'Activo', 1, CURRENT_TIMESTAMP, $4, $5, $6)
     RETURNING *`,
    [retiroId, empleadoId, equipoId, checklistSalidaId, fechaDevolucionEsperada, observaciones]
  );
  return res.rows[0];
}

/** El empleado marca que va a devolver el equipo (HU04, paso 1). */
async function marcarDevolucionSolicitada(id) {
  const res = await query(
    `UPDATE prestamo
     SET devolucion_solicitada = 1, fecha_solicitud_devolucion = CURRENT_TIMESTAMP
     WHERE id = $1
     RETURNING *`,
    [id]
  );
  return res.rows[0];
}

const SUBQUERY_INCIDENCIAS_ABIERTAS =
  "(SELECT COUNT(*)::int FROM incidencia i WHERE i.prestamo_id = p.id AND i.estado != 'Cerrada') AS incidencias_abiertas";

/** Prestamos activos de un empleado con datos del equipo y del retiro. */
async function listarActivosPorEmpleado(empleadoId) {
  const res = await query(
    `SELECT p.id, p.retiro_id, p.fecha_prestamo, p.devolucion_solicitada, p.fecha_solicitud_devolucion,
            e.id AS equipo_id, e.codigo_interno AS equipo_codigo, e.nombre AS equipo_nombre,
            e.categoria AS equipo_categoria,
            ${SUBQUERY_INCIDENCIAS_ABIERTAS}
     FROM prestamo p JOIN equipo e ON e.id = p.equipo_id
     WHERE p.empleado_id = $1 AND p.estado = 'Activo'
     ORDER BY p.devolucion_solicitada DESC, p.fecha_prestamo`,
    [empleadoId]
  );
  return res.rows;
}

/** Cola de devoluciones para el area de TIC: las solicitadas primero. */
async function listarPendientesDevolucion() {
  const res = await query(
    `SELECT p.id, p.retiro_id, p.fecha_prestamo, p.devolucion_solicitada, p.fecha_solicitud_devolucion,
            e.id AS equipo_id, e.codigo_interno AS equipo_codigo, e.nombre AS equipo_nombre,
            e.categoria AS equipo_categoria,
            CONCAT(emp.nombres, ' ', emp.apellidos) AS empleado_nombre, emp.sede AS empleado_sede,
            ${SUBQUERY_INCIDENCIAS_ABIERTAS}
     FROM prestamo p
     JOIN equipo e     ON e.id = p.equipo_id
     JOIN empleado emp ON emp.id = p.empleado_id
     WHERE p.estado = 'Activo'
     ORDER BY p.devolucion_solicitada DESC, p.fecha_solicitud_devolucion, p.fecha_prestamo`
  );
  return res.rows;
}

async function registrarDevolucion(id, { checklistRecepcionId }) {
  const res = await query(
    `UPDATE prestamo
     SET estado = 'Devuelto', fecha_devolucion_real = CURRENT_TIMESTAMP, checklist_recepcion_id = $1
     WHERE id = $2
     RETURNING *`,
    [checklistRecepcionId, id]
  );
  return res.rows[0];
}

module.exports = {
  buscarPorId,
  buscarDetallePorId,
  existePrestamoActivoDeEquipo,
  contarActivosDeRetiro,
  listarPorEmpleado,
  listarActivosPorEmpleado,
  listarPendientesDevolucion,
  marcarDevolucionSolicitada,
  crear,
  registrarDevolucion,
};