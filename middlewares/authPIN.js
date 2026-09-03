'use strict';

const config = require('../config/config');
const { verificarToken } = require('../utils/jwt');
const { errores } = require('../utils/errores');
const { TIPOS_ACTOR } = require('../config/constantes');
const empleadoModel = require('../models/empleadoModel');

function extraerToken(req) {
  const cabecera = req.headers.authorization || '';
  const [esquema, token] = cabecera.split(' ');
  return esquema === 'Bearer' && token ? token : null;
}

/**
 * Middleware de autenticacion para Empleado (RF01 / RNF05).
 * Valida el token de audiencia `empleado-pin` que emite POST /api/auth/pin.
 * Deja el empleado completo (incluye pin_hash) en `req.empleado` para que los
 * services puedan exigir el reingreso del PIN (RN02).
 */
function authPIN(req, _res, next) {
  try {
    const token = extraerToken(req);
    if (!token) throw errores.noAutenticado('Falta el token de sesion del empleado.');

    const payload = verificarToken(token, config.jwt.audienciaEmpleado);
    const empleado = empleadoModel.buscarPorId(payload.sub);
    if (!empleado || !empleado.activo) {
      throw errores.noAutenticado('El empleado ya no esta activo.');
    }

    req.empleado = empleado;
    req.actor = { tipo: TIPOS_ACTOR.EMPLEADO, id: empleado.id };
    next();
  } catch (error) {
    next(error);
  }
}

module.exports = authPIN;
