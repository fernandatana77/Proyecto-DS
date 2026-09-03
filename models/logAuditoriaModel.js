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

function hidratar(fila) {
  return { ...fila, detalle: fila.detalle_json ? JSON.parse(fila.detalle_json) : null };
}

module.exports = { insertar, consultar, buscarPorId };
