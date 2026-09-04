'use strict';

const AuditoriaService = require('../services/AuditoriaService');

/**
 * HU06 - Bitacora de auditoria para el Administrador. SOLO LECTURA: este
 * controller no expone ninguna operacion de escritura sobre `log_auditoria`.
 */

function presentarLog(l) {
  return {
    id: l.id,
    fecha: l.fecha,
    usuario: l.actor_label,
    actorTipo: l.actor_tipo,
    accion: l.accion,
    entidad: l.entidad,
    entidadId: l.entidad_id,
    detalle: l.detalle, // objeto ya parseado (o null)
    ip: l.ip,
  };
}

/**
 * GET /api/logs?desde=&hasta=&usuario=&accion=&actorTipo=&pagina=&porPagina=
 * (auth: staff con rol Admin)
 */
async function listar(req, res, next) {
  try {
    const resultado = AuditoriaService.consultarBitacora({
      desde: req.query.desde,
      hasta: req.query.hasta,
      usuario: req.query.usuario,
      accion: req.query.accion,
      actorTipo: req.query.actorTipo,
      pagina: req.query.pagina,
      porPagina: req.query.porPagina,
    });

    res.status(200).json({
      total: resultado.total,
      pagina: resultado.pagina,
      porPagina: resultado.porPagina,
      paginas: resultado.paginas,
      logs: resultado.logs.map(presentarLog),
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/logs/acciones   (auth: staff con rol Admin)
 * Acciones distintas presentes en la bitacora, para el filtro desplegable.
 */
async function acciones(_req, res, next) {
  try {
    res.status(200).json({ acciones: AuditoriaService.accionesRegistradas() });
  } catch (error) {
    next(error);
  }
}

module.exports = { listar, acciones };
