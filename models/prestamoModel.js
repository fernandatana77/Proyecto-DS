'use strict';

const { obtenerConexion } = require('../config/database');

/** Acceso a datos de la tabla `prestamo`. Solo SQL, sin logica de negocio. */

function buscarPorId(id) {
  return obtenerConexion().prepare('SELECT * FROM prestamo WHERE id = ?').get(id);
}

/** Vista enriquecida de un prestamo (equipo + empleado). */
function buscarDetallePorId(id) {
  return obtenerConexion()
    .prepare(
      `SELECT p.*,
              e.codigo_interno AS equipo_codigo, e.nombre AS equipo_nombre,
              e.categoria AS equipo_categoria,
              (emp.nombres || ' ' || emp.apellidos) AS empleado_nombre
       FROM prestamo p
       JOIN equipo e    ON e.id = p.equipo_id
       JOIN empleado emp ON emp.id = p.empleado_id
       WHERE p.id = ?`
    )
    .get(id);
}

function existePrestamoActivoDeEquipo(equipoId) {
  const fila = obtenerConexion()
    .prepare("SELECT 1 FROM prestamo WHERE equipo_id = ? AND estado = 'Activo' LIMIT 1")
    .get(equipoId);
  return Boolean(fila);
}

/** Conteo de prestamos activos que quedan en un retiro (HU04 -> estado del retiro). */
function contarActivosDeRetiro(retiroId) {
  const fila = obtenerConexion()
    .prepare("SELECT COUNT(*) AS n FROM prestamo WHERE retiro_id = ? AND estado = 'Activo'")
    .get(retiroId);
  return fila.n;
}

function listarPorEmpleado(empleadoId) {
  return obtenerConexion()
    .prepare(
      `SELECT p.*, e.codigo_interno AS equipo_codigo, e.nombre AS equipo_nombre, e.categoria AS equipo_categoria
       FROM prestamo p JOIN equipo e ON e.id = p.equipo_id
       WHERE p.empleado_id = ? ORDER BY p.fecha_prestamo DESC`
    )
    .all(empleadoId);
}

/**
 * Inserta un prestamo ya formalizado (parte de un retiro con checklist de
 * salida y aceptacion por PIN). Se usa siempre dentro de una transaccion.
 */
function crear({ retiroId, empleadoId, equipoId, checklistSalidaId, fechaDevolucionEsperada = null, observaciones = null }) {
  const info = obtenerConexion()
    .prepare(
      `INSERT INTO prestamo
         (retiro_id, empleado_id, equipo_id, estado, aceptado_con_pin, fecha_aceptacion,
          checklist_salida_id, fecha_devolucion_esperada, observaciones)
       VALUES (?, ?, ?, 'Activo', 1, datetime('now'), ?, ?, ?)`
    )
    .run(retiroId, empleadoId, equipoId, checklistSalidaId, fechaDevolucionEsperada, observaciones);
  return buscarPorId(Number(info.lastInsertRowid));
}

/** El empleado marca que va a devolver el equipo (HU04, paso 1). */
function marcarDevolucionSolicitada(id) {
  obtenerConexion()
    .prepare(
      `UPDATE prestamo
       SET devolucion_solicitada = 1, fecha_solicitud_devolucion = datetime('now')
       WHERE id = ?`
    )
    .run(id);
  return buscarPorId(id);
}

/** Prestamos activos de un empleado con datos del equipo y del retiro. */
function listarActivosPorEmpleado(empleadoId) {
  return obtenerConexion()
    .prepare(
      `SELECT p.id, p.retiro_id, p.fecha_prestamo, p.devolucion_solicitada, p.fecha_solicitud_devolucion,
              e.id AS equipo_id, e.codigo_interno AS equipo_codigo, e.nombre AS equipo_nombre,
              e.categoria AS equipo_categoria
       FROM prestamo p JOIN equipo e ON e.id = p.equipo_id
       WHERE p.empleado_id = ? AND p.estado = 'Activo'
       ORDER BY p.devolucion_solicitada DESC, p.fecha_prestamo`
    )
    .all(empleadoId);
}

/** Cola de devoluciones para el area de TIC: las solicitadas primero. */
function listarPendientesDevolucion() {
  return obtenerConexion()
    .prepare(
      `SELECT p.id, p.retiro_id, p.fecha_prestamo, p.devolucion_solicitada, p.fecha_solicitud_devolucion,
              e.id AS equipo_id, e.codigo_interno AS equipo_codigo, e.nombre AS equipo_nombre,
              e.categoria AS equipo_categoria,
              (emp.nombres || ' ' || emp.apellidos) AS empleado_nombre, emp.sede AS empleado_sede
       FROM prestamo p
       JOIN equipo e    ON e.id = p.equipo_id
       JOIN empleado emp ON emp.id = p.empleado_id
       WHERE p.estado = 'Activo'
       ORDER BY p.devolucion_solicitada DESC, p.fecha_solicitud_devolucion, p.fecha_prestamo`
    )
    .all();
}

function registrarDevolucion(id, { checklistRecepcionId }) {
  obtenerConexion()
    .prepare(
      `UPDATE prestamo
       SET estado = 'Devuelto', fecha_devolucion_real = datetime('now'), checklist_recepcion_id = ?
       WHERE id = ?`
    )
    .run(checklistRecepcionId, id);
  return buscarPorId(id);
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
