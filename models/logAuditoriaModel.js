'use strict';

const { query } = require('../config/database');

/**
 * Acceso a datos asíncrono de `log_auditoria` para PostgreSQL.
 */

async function insertar({ actorTipo, actorId = null, accion, entidad = null, entidadId = null, detalle = null, ip = null }) {
  const res = await query(
    `INSERT INTO log_auditoria (actor_tipo, actor_id, accion, entidad, entidad_id, detalle_json, ip)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      actorTipo,
      actorId,
      accion,
      entidad,
      entidadId,
      detalle == null ? null : JSON.stringify(detalle),
      ip
    ]
  );
  return hidratar(res.rows[0]);
}

async function buscarPorId(id) {
  const res = await query('SELECT * FROM log_auditoria WHERE id = $1', [id]);
  return res.rows[0] ? hidratar(res.rows[0]) : null;
}

async function consultar({ accion, entidad, actorTipo, desde, hasta, limite = 100, offset = 0 } = {}) {
  const filtros = [];
  const parametros = [];
  if (accion) {
    parametros.push(accion);
    filtros.push(`accion = $${parametros.length}`);
  }
  if (entidad) {
    parametros.push(entidad);
    filtros.push(`entidad = $${parametros.length}`);
  }
  if (actorTipo) {
    parametros.push(actorTipo);
    filtros.push(`actor_tipo = $${parametros.length}`);
  }
  if (desde) {
    parametros.push(desde);
    filtros.push(`fecha >= $${parametros.length}`);
  }
  if (hasta) {
    parametros.push(hasta);
    filtros.push(`fecha <= $${parametros.length}`);
  }
  const where = filtros.length ? `WHERE ${filtros.join(' AND ')}` : '';

  parametros.push(Math.min(Number(limite) || 100, 500));
  const limitPos = parametros.length;

  parametros.push(Number(offset) || 0);
  const offsetPos = parametros.length;

  const res = await query(`SELECT * FROM log_auditoria ${where} ORDER BY id DESC LIMIT $${limitPos} OFFSET $${offsetPos}`, parametros);
  return res.rows.map(hidratar);
}

const SELECT_BITACORA = `
  SELECT id, fecha, actor_tipo, actor_id, accion, entidad, entidad_id, detalle_json, ip, actor_label
  FROM (
    SELECT l.*,
      CASE
        WHEN l.actor_tipo IN ('Admin','Técnico')
          THEN COALESCE(us.usuario, 'usuario #' || l.actor_id)
        WHEN l.actor_tipo = 'Empleado'
          THEN COALESCE(CONCAT(emp.nombres, ' ', emp.apellidos), 'empleado #' || l.actor_id)
        ELSE l.actor_tipo
      END AS actor_label
    FROM log_auditoria l
    LEFT JOIN usuario_sistema us ON us.id = l.actor_id AND l.actor_tipo IN ('Admin','Técnico')
    LEFT JOIN empleado emp       ON emp.id = l.actor_id AND l.actor_tipo = 'Empleado'
  ) sub
`;

function _whereBitacora({ accion, actorTipo, usuario, desde, hasta }) {
  const cond = [];
  const params = [];
  if (accion) {
    params.push(accion);
    cond.push(`accion = $${params.length}`);
  }
  if (actorTipo) {
    params.push(actorTipo);
    cond.push(`actor_tipo = $${params.length}`);
  }
  if (usuario) {
    params.push(`%${usuario}%`);
    cond.push(`actor_label LIKE $${params.length}`);
  }
  if (desde) {
    params.push(desde);
    cond.push(`fecha >= $${params.length}`);
  }
  if (hasta) {
    params.push(hasta);
    cond.push(`fecha <= $${params.length}`);
  }
  return { where: cond.length ? `WHERE ${cond.join(' AND ')}` : '', params };
}

async function consultarBitacora(filtros = {}) {
  const { where, params } = _whereBitacora(filtros);
  const limite = Math.min(Number(filtros.limite) || 25, 100);
  const offset = Math.max(Number(filtros.offset) || 0, 0);

  params.push(limite);
  const posLimite = params.length;

  params.push(offset);
  const posOffset = params.length;

  const res = await query(`${SELECT_BITACORA} ${where} ORDER BY id DESC LIMIT $${posLimite} OFFSET $${posOffset}`, params);
  return res.rows.map(hidratar);
}

async function contarBitacora(filtros = {}) {
  const { where, params } = _whereBitacora(filtros);
  const res = await query(`SELECT COUNT(*)::int AS n FROM (${SELECT_BITACORA} ${where}) sub`, params);
  return res.rows[0].n;
}

async function accionesDistintas() {
  const res = await query('SELECT DISTINCT accion FROM log_auditoria ORDER BY accion');
  return res.rows.map((f) => f.accion);
}

function hidratar(fila) {
  if (!fila) return null;
  const detalle = typeof fila.detalle_json === 'string' ? JSON.parse(fila.detalle_json) : fila.detalle_json;
  return { ...fila, detalle: detalle || null };
}

module.exports = {
  insertar,
  consultar,
  consultarBitacora,
  contarBitacora,
  accionesDistintas,
  buscarPorId,
};