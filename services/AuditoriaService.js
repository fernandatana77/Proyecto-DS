'use strict';

const logAuditoriaModel = require('../models/logAuditoriaModel');

/**
 * Unica via para escribir y leer la bitacora de auditoria.
 *
 * RF07 / RN03: los logs son de solo lectura. Este service NO expone ninguna
 * operacion de edicion o borrado, y la BD lo refuerza con triggers
 * (ver models/esquema.js).
 */

/**
 * Registra un evento en la bitacora.
 * @param {object} evento
 * @param {string} evento.actorTipo  'Empleado' | 'Admin' | 'Técnico' | 'Sistema'
 * @param {number} [evento.actorId]
 * @param {string} evento.accion     una de ACCIONES_AUDITORIA
 * @param {string} [evento.entidad]
 * @param {number} [evento.entidadId]
 * @param {object} [evento.detalle]  se serializa a JSON
 * @param {string} [evento.ip]
 */
function registrar(evento) {
  return logAuditoriaModel.insertar(evento);
}

/** Consulta paginada y filtrable de la bitacora (HU06). Solo lectura. */
function consultar(filtros) {
  return logAuditoriaModel.consultar(filtros);
}

module.exports = { registrar, consultar };
