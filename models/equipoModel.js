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

/**
 * RN05 - Vida util % calculada AUTOMATICAMENTE segun la fecha de adquisicion:
 * depreciacion lineal, tiempo transcurrido / vida util total, acotada a [0, 100].
 * Misma formula que `DepreciacionService.calcularVidaUtil` (mes = 30.4375 dias).
 * Se calcula en la consulta -> nada que recalcular ni almacenar (RNF01).
 */
const SQL_VIDA_UTIL_PCT = `
  MIN(100.0, MAX(0.0,
    (julianday('now') - julianday(fecha_adquisicion)) / (vida_util_meses * 30.4375) * 100.0
  ))`;

const SQL_TIENE_VIDA_UTIL = "fecha_adquisicion IS NOT NULL AND vida_util_meses IS NOT NULL AND vida_util_meses > 0";

/** HU05 - Metricas del parque de equipos agrupadas por categoria (una sola query). */
function metricasPorCategoria() {
  return obtenerConexion()
    .prepare(
      `SELECT
         categoria,
         COUNT(*)                                   AS total,
         SUM(estado = 'Disponible')                 AS disponibles,
         SUM(estado = 'Prestado')                   AS prestados,
         SUM(estado = 'En Reparación')              AS en_reparacion,
         SUM(estado = 'En Instalación')             AS en_instalacion,
         SUM(estado = 'De Baja')                    AS de_baja,
         SUM(CASE WHEN ${SQL_TIENE_VIDA_UTIL} THEN 1 ELSE 0 END) AS con_vida_util,
         AVG(CASE WHEN ${SQL_TIENE_VIDA_UTIL} THEN ${SQL_VIDA_UTIL_PCT} ELSE NULL END) AS vida_util_pct
       FROM equipo
       GROUP BY categoria
       ORDER BY categoria`
    )
    .all();
}

/** HU05 - Equipos que superan `umbral`% de vida util consumida (los mas gastados primero). */
function equiposCercaFinVidaUtil({ categoria, umbral = 85, limite = 5 } = {}) {
  const params = [];
  let filtroCategoria = '';
  if (categoria) {
    filtroCategoria = 'AND categoria = ?';
    params.push(categoria);
  }
  return obtenerConexion()
    .prepare(
      `SELECT id, codigo_interno, nombre, categoria, estado, fecha_adquisicion, vida_util_meses, vida_util_pct
       FROM (
         SELECT id, codigo_interno, nombre, categoria, estado, fecha_adquisicion, vida_util_meses,
                ${SQL_VIDA_UTIL_PCT} AS vida_util_pct
         FROM equipo
         WHERE ${SQL_TIENE_VIDA_UTIL} ${filtroCategoria}
       )
       WHERE vida_util_pct >= ?
       ORDER BY vida_util_pct DESC
       LIMIT ?`
    )
    .all(...params, umbral, limite);
}

module.exports = {
  buscarPorId,
  buscarPorCodigo,
  listarCatalogo,
  crear,
  actualizarEstado,
  metricasPorCategoria,
  equiposCercaFinVidaUtil,
};
