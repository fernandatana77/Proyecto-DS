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

/** Consulta simple de la bitacora (uso interno / tests). Solo lectura. */
function consultar(filtros) {
  return logAuditoriaModel.consultar(filtros);
}

/**
 * HU06 - Bitacora para el Administrador: filtros (rango de fechas, usuario,
 * accion, tipo de actor) + paginacion + nombre del actor resuelto.
 * Estrictamente de SOLO LECTURA: no hay contraparte para editar ni borrar.
 * @returns {{ total, pagina, porPagina, paginas, logs }}
 */
function consultarBitacora(filtros = {}) {
  const porPagina = Math.min(Math.max(Number(filtros.porPagina) || 25, 1), 100);
  const pagina = Math.max(Number(filtros.pagina) || 1, 1);

  // "hasta" con solo fecha (YYYY-MM-DD) -> incluir el dia completo.
  const hasta =
    filtros.hasta && /^\d{4}-\d{2}-\d{2}$/.test(String(filtros.hasta).trim())
      ? `${String(filtros.hasta).trim()} 23:59:59`
      : filtros.hasta || undefined;

  const criterios = {
    accion: filtros.accion || undefined,
    actorTipo: filtros.actorTipo || undefined,
    usuario: filtros.usuario ? String(filtros.usuario).trim() : undefined,
    desde: filtros.desde ? String(filtros.desde).trim() : undefined,
    hasta,
  };

  const total = logAuditoriaModel.contarBitacora(criterios);
  const logs = logAuditoriaModel.consultarBitacora({
    ...criterios,
    limite: porPagina,
    offset: (pagina - 1) * porPagina,
  });

  return { total, pagina, porPagina, paginas: Math.max(1, Math.ceil(total / porPagina)), logs };
}

/** Acciones distintas registradas (para el filtro desplegable de la bitacora). */
function accionesRegistradas() {
  return logAuditoriaModel.accionesDistintas();
}

module.exports = { registrar, consultar, consultarBitacora, accionesRegistradas };
