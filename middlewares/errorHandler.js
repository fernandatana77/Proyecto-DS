'use strict';

const config = require('../config/config');
const { ErrorAplicacion } = require('../utils/errores');

/** 404 para rutas no definidas. Se monta despues de todas las rutas. */
function noEncontrado(req, res, _next) {
  res.status(404).json({
    error: { codigo: 'RUTA_NO_ENCONTRADA', mensaje: `No existe la ruta ${req.method} ${req.originalUrl}.` },
  });
}

/**
 * Manejador central de errores. Traduce cualquier excepcion a un JSON
 * `{ error: { codigo, mensaje } }`. NUNCA envia el stack al cliente; los 5xx
 * se registran solo en el servidor.
 */
// eslint-disable-next-line no-unused-vars -- Express identifica el handler por los 4 args
function errorHandler(err, req, res, next) {
  const esOperacional = err instanceof ErrorAplicacion || err?.esOperacional === true;
  const codigoHttp = esOperacional ? err.codigoHttp || 400 : 500;

  if (!esOperacional || codigoHttp >= 500) {
    console.error(`[ERROR ${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
    console.error(err);
  }

  const cuerpo = {
    error: {
      codigo: esOperacional ? err.codigo || 'SOLICITUD_INVALIDA' : 'ERROR_INTERNO',
      mensaje: esOperacional ? err.message : 'Ocurrio un error interno. Intente mas tarde.',
    },
  };
  if (esOperacional && err.detalles) cuerpo.error.detalles = err.detalles;
  if (!config.esProduccion && !esOperacional) cuerpo.error.debug = String(err.message || err);

  res.status(codigoHttp).json(cuerpo);
}

module.exports = { noEncontrado, errorHandler };
