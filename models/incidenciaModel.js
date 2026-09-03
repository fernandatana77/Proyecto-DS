'use strict';

const { obtenerConexion } = require('../config/database');

/** Acceso a datos de `incidencia` (HU03). Solo SQL, sin logica de negocio. */

function buscarPorId(id) {
  return obtenerConexion().prepare('SELECT * FROM incidencia WHERE id = ?').get(id);
}

/** Vista enriquecida: incidencia + equipo + empleado que la reporto. */
function buscarDetallePorId(id) {
  return obtenerConexion()
    .prepare(
      `SELECT i.*,
              e.codigo_interno AS equipo_codigo, e.nombre AS equipo_nombre, e.categoria AS equipo_categoria,
              (emp.nombres || ' ' || emp.apellidos) AS reportado_por_nombre
       FROM incidencia i
       JOIN equipo e     ON e.id = i.equipo_id
       LEFT JOIN empleado emp ON emp.id = i.reportado_por_id AND i.reportado_por_tipo = 'Empleado'
       WHERE i.id = ?`
    )
    .get(id);
}

function listarPorEquipo(equipoId) {
  return obtenerConexion()
    .prepare('SELECT * FROM incidencia WHERE equipo_id = ? ORDER BY fecha_reporte DESC')
    .all(equipoId);
}

function listarPorPrestamo(prestamoId) {
  return obtenerConexion()
    .prepare('SELECT * FROM incidencia WHERE prestamo_id = ? ORDER BY fecha_reporte DESC')
    .all(prestamoId);
}

/** RN04: una incidencia distinta de 'Cerrada' cuenta como abierta. */
function existeIncidenciaAbiertaDePrestamo(prestamoId) {
  const fila = obtenerConexion()
    .prepare("SELECT 1 FROM incidencia WHERE prestamo_id = ? AND estado != 'Cerrada' LIMIT 1")
    .get(prestamoId);
  return Boolean(fila);
}

function contarAbiertasPorPrestamo(prestamoId) {
  return obtenerConexion()
    .prepare("SELECT COUNT(*) AS n FROM incidencia WHERE prestamo_id = ? AND estado != 'Cerrada'")
    .get(prestamoId).n;
}

/** Incidencias reportadas por un empleado (para que vea sus reportes y el estado). */
function listarPorEmpleado(empleadoId) {
  return obtenerConexion()
    .prepare(
      `SELECT i.*, e.codigo_interno AS equipo_codigo, e.nombre AS equipo_nombre, e.categoria AS equipo_categoria
       FROM incidencia i JOIN equipo e ON e.id = i.equipo_id
       WHERE i.reportado_por_tipo = 'Empleado' AND i.reportado_por_id = ?
       ORDER BY i.fecha_reporte DESC`
    )
    .all(empleadoId);
}

/**
 * Cola de incidencias para TIC. `sin clasificar` primero, luego mas recientes.
 * Filtros opcionales: `estado`, `severidad`, `prestamoId`.
 */
function listarParaTIC({ estado, severidad, prestamoId } = {}) {
  const filtros = [];
  const params = [];
  if (estado) {
    filtros.push('i.estado = ?');
    params.push(estado);
  }
  if (severidad) {
    filtros.push('i.severidad = ?');
    params.push(severidad);
  }
  if (prestamoId) {
    filtros.push('i.prestamo_id = ?');
    params.push(prestamoId);
  }
  const where = filtros.length ? `WHERE ${filtros.join(' AND ')}` : '';

  return obtenerConexion()
    .prepare(
      `SELECT i.*,
              e.codigo_interno AS equipo_codigo, e.nombre AS equipo_nombre, e.categoria AS equipo_categoria,
              (emp.nombres || ' ' || emp.apellidos) AS reportado_por_nombre, emp.sede AS reportado_por_sede
       FROM incidencia i
       JOIN equipo e ON e.id = i.equipo_id
       LEFT JOIN empleado emp ON emp.id = i.reportado_por_id AND i.reportado_por_tipo = 'Empleado'
       ${where}
       ORDER BY (i.severidad = 'sin clasificar') DESC,
                (i.estado = 'Cerrada') ASC,
                i.fecha_reporte DESC`
    )
    .all(...params);
}

/** El Empleado solo aporta `descripcion`; el resto son valores por defecto. */
function crear({ prestamoId = null, equipoId, reportadoPorTipo, reportadoPorId = null, descripcion }) {
  const info = obtenerConexion()
    .prepare(
      `INSERT INTO incidencia (prestamo_id, equipo_id, reportado_por_tipo, reportado_por_id, descripcion)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(prestamoId, equipoId, reportadoPorTipo, reportadoPorId, descripcion);
  return buscarPorId(Number(info.lastInsertRowid));
}

/** Triage de TIC: severidad / estado / notas. `fechaCierre` se pasa explicito. */
function actualizarTriage(id, { severidad, estado, notasTic, atendidaPorId, fechaCierre }) {
  obtenerConexion()
    .prepare(
      `UPDATE incidencia
       SET severidad = ?, estado = ?, notas_tic = ?, atendida_por_id = ?,
           fecha_actualizacion = datetime('now'), fecha_cierre = ?
       WHERE id = ?`
    )
    .run(severidad, estado, notasTic ?? null, atendidaPorId ?? null, fechaCierre ?? null, id);
  return buscarPorId(id);
}

module.exports = {
  buscarPorId,
  buscarDetallePorId,
  listarPorEquipo,
  listarPorPrestamo,
  listarPorEmpleado,
  listarParaTIC,
  existeIncidenciaAbiertaDePrestamo,
  contarAbiertasPorPrestamo,
  crear,
  actualizarTriage,
};
