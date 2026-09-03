'use strict';

const config = require('../config/config');
const { verificarToken } = require('../utils/jwt');
const { errores } = require('../utils/errores');
const { TIPOS_ACTOR } = require('../config/constantes');
const empleadoModel = require('../models/empleadoModel');
const usuarioSistemaModel = require('../models/usuarioSistemaModel');

function extraerToken(req) {
  const cabecera = req.headers.authorization || '';
  const [esquema, token] = cabecera.split(' ');
  return esquema === 'Bearer' && token ? token : null;
}

/**
 * Autenticacion para recursos que consultan AMBOS perfiles (p. ej. el catalogo,
 * HU02): acepta el token PIN de empleado o el JWT de staff. Deja `req.actor`
 * y, segun el caso, `req.empleado` o `req.usuario`.
 */
function autenticacionMixta(req, _res, next) {
  try {
    const token = extraerToken(req);
    if (!token) throw errores.noAutenticado('Falta el token de autenticacion.');

    // 1) intentar como token de empleado
    try {
      const payload = verificarToken(token, config.jwt.audienciaEmpleado);
      const empleado = empleadoModel.buscarPorId(payload.sub);
      if (empleado && empleado.activo) {
        req.empleado = empleado;
        req.actor = { tipo: TIPOS_ACTOR.EMPLEADO, id: empleado.id };
        return next();
      }
    } catch (_) {
      /* no era token de empleado; se prueba como staff */
    }

    // 2) intentar como token de staff
    const payloadStaff = verificarToken(token, config.jwt.audienciaStaff);
    const usuario = usuarioSistemaModel.buscarPorId(payloadStaff.sub);
    if (!usuario || !usuario.activo) throw errores.noAutenticado('La cuenta ya no esta activa.');

    req.usuario = { id: usuario.id, usuario: usuario.usuario, rol: usuario.rol };
    req.actor = { tipo: usuario.rol, id: usuario.id };
    next();
  } catch (error) {
    next(error);
  }
}

module.exports = autenticacionMixta;
