'use strict';

const { AUTENTICACION } = require('../config/constantes');
const { errores } = require('../utils/errores');

/**
 * RNF05: 3 intentos fallidos de PIN bloquean el acceso 15 minutos.
 *
 * El login de empleado no lleva identificador (solo PIN), asi que el conteo es
 * POR IP. Estado en memoria del proceso: Map<ip, { fallos, bloqueadoHasta }>.
 * (Para multi-instancia habria que mover esto a un store compartido.)
 */
const intentosPorIp = new Map();

function ipDe(req) {
  return req.ip || req.socket?.remoteAddress || 'desconocida';
}

function estadoDe(ip) {
  return intentosPorIp.get(ip) || { fallos: 0, bloqueadoHasta: 0 };
}

/** Middleware: corta la peticion si la IP esta bloqueada. */
function rateLimitPIN(req, _res, next) {
  const ip = ipDe(req);
  const { bloqueadoHasta } = estadoDe(ip);
  const ahora = Date.now();

  if (bloqueadoHasta > ahora) {
    const minutos = Math.ceil((bloqueadoHasta - ahora) / 60000);
    req.bloqueoPin = { activo: true, minutosRestantes: minutos };
    return next(
      errores.demasiadasSolicitudes(
        `Demasiados intentos fallidos. Intente de nuevo en ${minutos} minuto(s).`,
        'PIN_BLOQUEADO'
      )
    );
  }
  next();
}

/** Registra un intento fallido; al llegar al maximo activa el bloqueo. */
function registrarIntentoFallido(req) {
  const ip = ipDe(req);
  const estado = estadoDe(ip);
  estado.fallos += 1;

  if (estado.fallos >= AUTENTICACION.MAX_INTENTOS_PIN) {
    estado.bloqueadoHasta = Date.now() + AUTENTICACION.BLOQUEO_PIN_MS;
  }
  intentosPorIp.set(ip, estado);

  const bloqueado = estado.bloqueadoHasta > Date.now();
  return {
    fallos: estado.fallos,
    intentosRestantes: Math.max(0, AUTENTICACION.MAX_INTENTOS_PIN - estado.fallos),
    bloqueado,
  };
}

/** Login exitoso: se limpia el historial de la IP. */
function reiniciar(req) {
  intentosPorIp.delete(ipDe(req));
}

/** Solo para tests. */
function _limpiarTodo() {
  intentosPorIp.clear();
}

module.exports = { rateLimitPIN, registrarIntentoFallido, reiniciar, _limpiarTodo };
