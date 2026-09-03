'use strict';

const { obtenerConexion } = require('../config/database');

/** Acceso a datos de `incidencia`. (HU03 se implementa despues del slice vertical.) */

function buscarPorId(id) {
  return obtenerConexion().prepare('SELECT * FROM incidencia WHERE id = ?').get(id);
}

function listarPorEquipo(equipoId) {
  return obtenerConexion()
    .prepare('SELECT * FROM incidencia WHERE equipo_id = ? ORDER BY fecha_reporte DESC')
    .all(equipoId);
}

function existeIncidenciaAbiertaDePrestamo(prestamoId) {
  const fila = obtenerConexion()
    .prepare("SELECT 1 FROM incidencia WHERE prestamo_id = ? AND estado != 'Cerrada' LIMIT 1")
    .get(prestamoId);
  return Boolean(fila);
}

function crear({ prestamoId = null, equipoId, reportadoPorTipo, reportadoPorId = null, descripcion, severidad = 'media' }) {
  const info = obtenerConexion()
    .prepare(
      `INSERT INTO incidencia
         (prestamo_id, equipo_id, reportado_por_tipo, reportado_por_id, descripcion, severidad)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(prestamoId, equipoId, reportadoPorTipo, reportadoPorId, descripcion, severidad);
  return buscarPorId(Number(info.lastInsertRowid));
}

module.exports = { buscarPorId, listarPorEquipo, existeIncidenciaAbiertaDePrestamo, crear };
