'use strict';

const { query } = require('../config/database');

/** Acceso a datos asíncrono de `incidencia` para PostgreSQL. */

async function buscarPorId(id) {
  const res = await query('SELECT * FROM incidencia WHERE id = $1', [id]);
  return res.rows[0] || null;
}

/** Vista enriquecida: incidencia + equipo + empleado que la reporto. */
async function buscarDetallePorId(id) {
  const res = await query(
    `SELECT i.*,
            e.codigo_interno AS equipo_codigo, e.nombre AS equipo_nombre, e.categoria AS equipo_categoria,
            CONCAT(emp.nombres, ' ', emp.apellidos) AS reportado_por_nombre
     FROM incidencia i
     JOIN equipo e         ON e.id = i.equipo_id
     LEFT JOIN empleado emp ON emp.id = i.reportado_por_id AND i.reportado_por_tipo = 'Empleado'
     WHERE i.id = $1`,
    [id]
  );
  return res.rows[0] || null;
}

async function listarPorEquipo(equipoId) {
  const res = await query('SELECT * FROM incidencia WHERE equipo_id = $1 ORDER BY fecha_reporte DESC', [equipoId]);
  return res.rows;
}

async function listarPorPrestamo(prestamoId) {
  const res = await query('SELECT * FROM incidencia WHERE prestamo_id = $1 ORDER BY fecha_reporte DESC', [prestamoId]);
  return res.rows;
}

/** RN04: una incidencia distinta de 'Cerrada' cuenta como abierta. */
async function existeIncidenciaAbiertaDePrestamo(prestamoId) {
  const res = await query("SELECT 1 FROM incidencia WHERE prestamo_id = $1 AND estado != 'Cerrada' LIMIT 1", [prestamoId]);
  return res.rows.length > 0;
}

async function contarAbiertasPorPrestamo(prestamoId) {
  const res = await query("SELECT COUNT(*)::int AS n FROM incidencia WHERE prestamo_id = $1 AND estado != 'Cerrada'", [prestamoId]);
  return res.rows[0].n;
}

/** Incidencias reportadas por un empleado (para que vea sus reportes y el estado). */
async function listarPorEmpleado(empleadoId) {
  const res = await query(
    `SELECT i.*, e.codigo_interno AS equipo_codigo, e.nombre AS equipo_nombre, e.categoria AS equipo_categoria
     FROM incidencia i JOIN equipo e ON e.id = i.equipo_id
     WHERE i.reportado_por_tipo = 'Empleado' AND i.reportado_por_id = $1
     ORDER BY i.fecha_reporte DESC`,
    [empleadoId]
  );
  return res.rows;
}

/**
 * Cola de incidencias para TIC. `sin clasificar` primero, luego mas recientes.
 * Filtros opcionales: `estado`, `severidad`, `prestamoId`.
 */
async function listarParaTIC({ estado, severidad, prestamoId } = {}) {
  const filtros = [];
  const params = [];
  if (estado) {
    params.push(estado);
    filtros.push(`i.estado = $${params.length}`);
  }
  if (severidad) {
    params.push(severidad);
    filtros.push(`i.severidad = $${params.length}`);
  }
  if (prestamoId) {
    params.push(prestamoId);
    filtros.push(`i.prestamo_id = $${params.length}`);
  }
  const where = filtros.length ? `WHERE ${filtros.join(' AND ')}` : '';

  const sql = `SELECT i.*,
            e.codigo_interno AS equipo_codigo, e.nombre AS equipo_nombre, e.categoria AS equipo_categoria,
            CONCAT(emp.nombres, ' ', emp.apellidos) AS reportado_por_nombre, emp.sede AS reportado_por_sede
     FROM incidencia i
     JOIN equipo e ON e.id = i.equipo_id
     LEFT JOIN empleado emp ON emp.id = i.reportado_por_id AND i.reportado_por_tipo = 'Empleado'
     ${where}
     ORDER BY (i.severidad = 'sin clasificar') DESC,
              (i.estado = 'Cerrada') ASC,
              i.fecha_reporte DESC`;

  const res = await query(sql, params);
  return res.rows;
}

/** El Empleado solo aporta `descripcion`; el resto son valores por defecto. */
async function crear({ prestamoId = null, equipoId, reportadoPorTipo, reportadoPorId = null, descripcion }) {
  const res = await query(
    `INSERT INTO incidencia (prestamo_id, equipo_id, reportado_por_tipo, reportado_por_id, descripcion)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [prestamoId, equipoId, reportadoPorTipo, reportadoPorId, descripcion]
  );
  return res.rows[0];
}

/**
 * Cierra todas las incidencias abiertas de un equipo (p. ej. al finalizar su
 * reparacion). Devuelve cuantas se cerraron.
 */
async function cerrarAbiertasDeEquipo(equipoId, { atendidaPorId = null } = {}) {
  const res = await query(
    `UPDATE incidencia
     SET estado = 'Cerrada',
         fecha_cierre = CURRENT_TIMESTAMP,
         fecha_actualizacion = CURRENT_TIMESTAMP,
         atendida_por_id = COALESCE(atendida_por_id, $1)
     WHERE equipo_id = $2 AND estado != 'Cerrada'`,
    [atendidaPorId, equipoId]
  );
  return res.rowCount;
}

/** Triage de TIC: severidad / estado / notas. `fechaCierre` se pasa explicito. */
async function actualizarTriage(id, { severidad, estado, notasTic, atendidaPorId, fechaCierre }) {
  const res = await query(
    `UPDATE incidencia
     SET severidad = $1, estado = $2, notas_tic = $3, atendida_por_id = $4,
         fecha_actualizacion = CURRENT_TIMESTAMP, fecha_cierre = $5
     WHERE id = $6
     RETURNING *`,
    [severidad, estado, notasTic ?? null, atendidaPorId ?? null, fechaCierre ?? null, id]
  );
  return res.rows[0];
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
  cerrarAbiertasDeEquipo,
};