'use strict';

const { obtenerConexion } = require('../config/database');

/** Acceso a datos de la tabla `equipo`. Solo SQL, sin logica de negocio. */

function buscarPorId(id) {
  return obtenerConexion().prepare('SELECT * FROM equipo WHERE id = ?').get(id);
}

function buscarPorCodigo(codigoInterno) {
  return obtenerConexion().prepare('SELECT * FROM equipo WHERE codigo_interno = ?').get(codigoInterno);
}

/**
 * Catalogo con estado de asignacion actual (HU02) y conteo de componentes con
 * observaciones, para resumir el estado fisico sin abrir el detalle.
 */
function listarCatalogo({ estado, sede, categoria } = {}) {
  const filtros = [];
  const parametros = [];
  if (estado) {
    filtros.push('e.estado = ?');
    parametros.push(estado);
  }
  if (sede) {
    filtros.push('e.sede = ?');
    parametros.push(sede);
  }
  if (categoria) {
    filtros.push('e.categoria = ?');
    parametros.push(categoria);
  }
  const where = filtros.length ? `WHERE ${filtros.join(' AND ')}` : '';

  return obtenerConexion()
    .prepare(
      `SELECT e.*,
              p.id             AS prestamo_activo_id,
              p.fecha_prestamo AS prestamo_activo_desde,
              emp.id           AS asignado_empleado_id,
              (emp.nombres || ' ' || emp.apellidos) AS asignado_empleado_nombre,
              (SELECT COUNT(*) FROM componente_equipo c WHERE c.equipo_id = e.id AND c.estado = 'malo')    AS comp_malos,
              (SELECT COUNT(*) FROM componente_equipo c WHERE c.equipo_id = e.id AND c.estado = 'regular') AS comp_regulares
       FROM equipo e
       LEFT JOIN prestamo p  ON p.equipo_id = e.id AND p.estado = 'Activo'
       LEFT JOIN empleado emp ON emp.id = p.empleado_id
       ${where}
       ORDER BY e.categoria, e.codigo_interno`
    )
    .all(...parametros);
}

function crear(datos) {
  const info = obtenerConexion()
    .prepare(
      `INSERT INTO equipo
         (codigo_interno, nombre, categoria, marca, modelo, numero_serie, estado, sede, ubicacion,
          fecha_adquisicion, valor_adquisicion, vida_util_meses)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      datos.codigoInterno,
      datos.nombre,
      datos.categoria,
      datos.marca ?? null,
      datos.modelo ?? null,
      datos.numeroSerie ?? null,
      datos.estado ?? 'Disponible',
      datos.sede,
      datos.ubicacion ?? null,
      datos.fechaAdquisicion ?? null,
      datos.valorAdquisicion ?? null,
      datos.vidaUtilMeses ?? 48
    );
  return buscarPorId(Number(info.lastInsertRowid));
}

/** Cambia el estado del equipo. La decision de negocio la toma un service. */
function actualizarEstado(id, nuevoEstado) {
  obtenerConexion().prepare('UPDATE equipo SET estado = ? WHERE id = ?').run(nuevoEstado, id);
  return buscarPorId(id);
}

module.exports = { buscarPorId, buscarPorCodigo, listarCatalogo, crear, actualizarEstado };
