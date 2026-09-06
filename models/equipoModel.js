'use strict';

const { query } = require('../config/database');

/** Acceso a datos asíncrono de la tabla `equipo` para PostgreSQL. */

async function buscarPorId(id) {
  const res = await query('SELECT * FROM equipo WHERE id = $1', [id]);
  return res.rows[0] || null;
}

async function buscarPorCodigo(codigoInterno) {
  const res = await query('SELECT * FROM equipo WHERE codigo_interno = $1', [codigoInterno]);
  return res.rows[0] || null;
}

/**
 * Catálogo con estado de asignación actual (HU02) y conteo de componentes.
 */
async function listarCatalogo({ estado, sede, categoria } = {}) {
  const filtros = [];
  const parametros = [];

  if (estado) {
    parametros.push(estado);
    filtros.push(`e.estado = $${parametros.length}`);
  }
  if (sede) {
    parametros.push(sede);
    filtros.push(`e.sede = $${parametros.length}`);
  }
  if (categoria) {
    parametros.push(categoria);
    filtros.push(`e.categoria = $${parametros.length}`);
  }

  const where = filtros.length ? `WHERE ${filtros.join(' AND ')}` : '';

  const sql = `
    SELECT e.*,
           p.id             AS prestamo_activo_id,
           p.fecha_prestamo AS prestamo_activo_desde,
           emp.id           AS asignado_empleado_id,
           CONCAT(emp.nombres, ' ', emp.apellidos) AS asignado_empleado_nombre,
           (SELECT COUNT(*) FROM componente_equipo c WHERE c.equipo_id = e.id AND c.estado = 'malo')     AS comp_malos,
           (SELECT COUNT(*) FROM componente_equipo c WHERE c.equipo_id = e.id AND c.estado = 'regular') AS comp_regulares
    FROM equipo e
    LEFT JOIN prestamo p   ON p.equipo_id = e.id AND p.estado = 'Activo'
    LEFT JOIN empleado emp ON emp.id = p.empleado_id
    ${where}
    ORDER BY e.categoria, e.codigo_interno`;

  const res = await query(sql, parametros);
  return res.rows;
}

async function crear(datos) {
  const res = await query(
    `INSERT INTO equipo
       (codigo_interno, nombre, categoria, marca, modelo, numero_serie, estado, sede, ubicacion,
        fecha_adquisicion, valor_adquisicion, vida_util_meses)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING *`,
    [
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
    ]
  );
  return res.rows[0];
}

async function actualizarEstado(id, nuevoEstado) {
  const res = await query(
    'UPDATE equipo SET estado = $1 WHERE id = $2 RETURNING *',
    [nuevoEstado, id]
  );
  return res.rows[0];
}

/**
 * RN05 - Vida útil % calculada AUTOMÁTICAMENTE en PostgreSQL:
 * (días transcurridos) / (días de vida útil) * 100
 */
const SQL_VIDA_UTIL_PCT = `
  LEAST(100.0, GREATEST(0.0,
    (EXTRACT(EPOCH FROM (NOW() - fecha_adquisicion::timestamp)) / 86400.0) / (vida_util_meses * 30.4375) * 100.0
  ))`;

const SQL_TIENE_VIDA_UTIL = "fecha_adquisicion IS NOT NULL AND vida_util_meses IS NOT NULL AND vida_util_meses > 0";

/** HU05 - Métricas del parque de equipos agrupadas por categoría. */
async function metricasPorCategoria() {
  const sql = `
    SELECT
      categoria,
      COUNT(*)::int                                                  AS total,
      COUNT(*) FILTER (WHERE estado = 'Disponible')::int             AS disponibles,
      COUNT(*) FILTER (WHERE estado = 'Prestado')::int               AS prestados,
      COUNT(*) FILTER (WHERE estado = 'En Reparación')::int          AS en_reparacion,
      COUNT(*) FILTER (WHERE estado = 'En Instalación')::int         AS en_instalacion,
      COUNT(*) FILTER (WHERE estado = 'De Baja')::int                AS de_baja,
      COUNT(*) FILTER (WHERE ${SQL_TIENE_VIDA_UTIL})::int            AS con_vida_util,
      AVG(CASE WHEN ${SQL_TIENE_VIDA_UTIL} THEN ${SQL_VIDA_UTIL_PCT} ELSE NULL END)::float AS vida_util_pct
    FROM equipo
    GROUP BY categoria
    ORDER BY categoria`;

  const res = await query(sql);
  return res.rows;
}

/** HU05 - Equipos que superan umbral% de vida útil consumida. */
async function equiposCercaFinVidaUtil({ categoria, umbral = 85, limite = 5 } = {}) {
  const params = [];
  let filtroCategoria = '';

  if (categoria) {
    params.push(categoria);
    filtroCategoria = `AND categoria = $${params.length}`;
  }

  params.push(umbral);
  const posUmbral = params.length;

  params.push(limite);
  const posLimite = params.length;

  const sql = `
    SELECT id, codigo_interno, nombre, categoria, estado, fecha_adquisicion, vida_util_meses, vida_util_pct
    FROM (
      SELECT id, codigo_interno, nombre, categoria, estado, fecha_adquisicion, vida_util_meses,
             ${SQL_VIDA_UTIL_PCT} AS vida_util_pct
      FROM equipo
      WHERE ${SQL_TIENE_VIDA_UTIL} ${filtroCategoria}
    ) sub
    WHERE vida_util_pct >= $${posUmbral}
    ORDER BY vida_util_pct DESC
    LIMIT $${posLimite}`;

  const res = await query(sql, params);
  return res.rows;
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