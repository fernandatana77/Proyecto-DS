'use strict';

/**
 * Error de negocio/entrada que el cliente SI puede ver.
 * `errorHandler` lo traduce a `{ error: { codigo, mensaje } }` con `codigoHttp`.
 */
class ErrorAplicacion extends Error {
  constructor(mensaje, codigoHttp = 400, codigo = 'SOLICITUD_INVALIDA', detalles = undefined) {
    super(mensaje);
    this.name = 'ErrorAplicacion';
    this.codigoHttp = codigoHttp;
    this.codigo = codigo;
    this.detalles = detalles;
    this.esOperacional = true;
  }
}

// Atajos para los casos mas comunes.
const errores = {
  solicitudInvalida: (mensaje, codigo = 'SOLICITUD_INVALIDA', detalles) =>
    new ErrorAplicacion(mensaje, 400, codigo, detalles),
  noAutenticado: (mensaje = 'Credenciales invalidas.', codigo = 'NO_AUTENTICADO') =>
    new ErrorAplicacion(mensaje, 401, codigo),
  prohibido: (mensaje = 'No tiene permisos para esta accion.', codigo = 'PROHIBIDO') =>
    new ErrorAplicacion(mensaje, 403, codigo),
  noEncontrado: (mensaje = 'Recurso no encontrado.', codigo = 'NO_ENCONTRADO') =>
    new ErrorAplicacion(mensaje, 404, codigo),
  conflicto: (mensaje, codigo = 'CONFLICTO') => new ErrorAplicacion(mensaje, 409, codigo),
  demasiadasSolicitudes: (mensaje, codigo = 'BLOQUEADO') =>
    new ErrorAplicacion(mensaje, 429, codigo),
};

module.exports = { ErrorAplicacion, errores };
