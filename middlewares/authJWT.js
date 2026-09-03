'use strict';

const config = require('../config/config');
const { verificarToken } = require('../utils/jwt');
const { errores } = require('../utils/errores');
const { ROLES_STAFF } = require('../config/constantes');
const usuarioSistemaModel = require('../models/usuarioSistemaModel');

/** Extrae el token "Bearer <token>" de la cabecera Authorization. */
function extraerToken(req) {
  const cabecera = req.headers.authorization || '';
  const [esquema, token] = cabecera.split(' ');
  return esquema === 'Bearer' && token ? token : null;
}

/**
 * Middleware de autenticacion para Admin / Tecnico (RF01).
 * @param {string[]} rolesPermitidos por defecto todos los roles de staff.
 */
function authJWT(rolesPermitidos = ROLES_STAFF) {
  return (req, _res, next) => {
    try {
      const token = extraerToken(req);
      if (!token) throw errores.noAutenticado('Falta el token de autenticacion.');

      const payload = verificarToken(token, config.jwt.audienciaStaff);
      const usuario = usuarioSistemaModel.buscarPorId(payload.sub);
      if (!usuario || !usuario.activo) {
        throw errores.noAutenticado('La cuenta ya no esta activa.');
      }
      if (!rolesPermitidos.includes(usuario.rol)) {
        throw errores.prohibido('Su rol no tiene acceso a este recurso.');
      }

      req.usuario = { id: usuario.id, usuario: usuario.usuario, rol: usuario.rol };
      req.actor = { tipo: usuario.rol, id: usuario.id };
      next();
    } catch (error) {
      next(error);
    }
  };
}

module.exports = authJWT;
