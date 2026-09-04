'use strict';

const { obtenerConexion } = require('../config/database');

/**
 * Acceso a datos de `log_auditoria`.
 * A PROPOSITO solo expone insertar + consultar: RF07 / RN03 (bitacora
 * inmutable). La BD ademas lo impide con triggers (ver models/esquema.js).
 */

function insertar({ actorTipo, actorId = null, accion, entidad = null, entidadId = null, detalle = null, ip = null }) {
  const info = obtenerConexion()
    .prepare(
      `INSERT INTO log_auditoria (actor_tipo, actor_id, accion, entidad, entidad_id, detalle_json, ip)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      actorTipo,
      actorId,
      accion,
      entidad,
      entidadId,
      detalle == null ? null : JSON.stringify(detalle),
      ip
    );
  return buscarPorId(Number(info.lastInsertRowid));
}

function buscarPorId(id) {
  const fila = obtenerConexion().prepare('SELECT * FROM log_auditoria WHERE id = ?').get(id);
  return fila ? hidratar(fila) : undefined;
}

function consultar({ accion, entidad, actorTipo, desde, hasta, limite = 100, offset = 0 } = {}) {
  const filtros = [];
  const parametros = [];
  if (accion) {
    filtros.push('accion = ?');
    parametros.push(accion);
  }
  if (entidad) {
    filtros.push('entidad = ?');
    parametros.push(entidad);
  }
  if (actorTipo) {
    filtros.push('actor_tipo = ?');
    parametros.push(actorTipo);
  }
  if (desde) {
    filtros.push('fecha >= ?');
    parametros.push(desde);
  }
  if (hasta) {
    filtros.push('fecha <= ?');
    parametros.push(hasta);
  }
  const where = filtros.length ? `WHERE ${filtros.join(' AND ')}` : '';
  parametros.push(Math.min(Number(limite) || 100, 500), Number(offset) || 0);

  return obtenerConexion()
    .prepare(`SELECT * FROM log_auditoria ${where} ORDER BY id DESC LIMIT ? OFFSET ?`)
    .all(...parametros)
    .map(hidratar);
}

/**
 * HU06 - Bitacora para el Administrador: resuelve el nombre del actor
 * (usuario de staff o nombre del empleado) y admite filtros + paginacion.
 * Sigue siendo de SOLO LECTURA.
 */
const SELECT_BITACORA = `
  SELECT id, fecha, actor_tipo, actor_id, accion, entidad, entidad_id, detalle_json, ip, actor_label
  FROM (
    SELECT l.*,
      CASE
        WHEN l.actor_tipo IN ('Admin','Técnico')
          THEN COALESCE(us.usuario, 'usuario #' || l.actor_id)
        WHEN l.actor_tipo = 'Empleado'
          THEN COALESCE(emp.nombres || ' ' || emp.apellidos, 'empleado #' || l.actor_id)
        ELSE l.actor_tipo
      END AS actor_label
    FROM log_auditoria l
    LEFT JOIN usuario_sistema us ON us.id = l.actor_id AND l.actor_tipo IN ('Admin','Técnico')
    LEFT JOIN empleado emp       ON emp.id = l.actor_id AND l.actor_tipo = 'Empleado'
  )
`;

function _whereBitacora({ accion, actorTipo, usuario, desde, hasta }) {
  const cond = [];
  const params = [];
  if (accion) {
    cond.push('accion = ?');
    params.push(accion);
  }
  if (actorTipo) {
    cond.push('actor_tipo = ?');
    params.push(actorTipo);
  }
  if (usuario) {
    cond.push('actor_label LIKE ?');
    params.push(`%${usuario}%`);
  }
  if (desde) {
    cond.push('fecha >= ?');
    params.push(desde);
  }
  if (hasta) {
    cond.push('fecha <= ?');
    params.push(hasta);
  }
  return { where: cond.length ? `WHERE ${cond.join(' AND ')}` : '', params };
}

function consultarBitacora(filtros = {}) {
  const { where, params } = _whereBitacora(filtros);
  const limite = Math.min(Number(filtros.limite) || 25, 100);
  const offset = Math.max(Number(filtros.offset) || 0, 0);
  return obtenerConexion()
    .prepare(`${SELECT_BITACORA} ${where} ORDER BY id DESC LIMIT ? OFFSET ?`)
    .all(...params, limite, offset)
    .map(hidratar);
}

function contarBitacora(filtros = {}) {
  const { where, params } = _whereBitacora(filtros);
  return obtenerConexion()
    .prepare(`SELECT COUNT(*) AS n FROM (${SELECT_BITACORA} ${where})`)
    .get(...params).n;
}

/** Acciones distintas presentes en la bitacora (para el filtro desplegable). */
function accionesDistintas() {
  return obtenerConexion()
    .prepare('SELECT DISTINCT accion FROM log_auditoria ORDER BY accion')
    .all()
    .map((f) => f.accion);
}

function hidratar(fila) {
  return { ...fila, detalle: fila.detalle_json ? JSON.parse(fila.detalle_json) : null };
}

module.exports = {
  insertar,
  consultar,
  consultarBitacora,
  contarBitacora,
  accionesDistintas,
  buscarPorId,
};
