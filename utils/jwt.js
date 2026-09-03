'use strict';

const jwt = require('jsonwebtoken');
const config = require('../config/config');
const { errores } = require('./errores');

/** Firma un token para Admin/Tecnico. */
function firmarTokenStaff(usuario) {
  return jwt.sign(
    { sub: usuario.id, tipo: 'staff', rol: usuario.rol, usuario: usuario.usuario },
    config.jwt.secreto,
    {
      expiresIn: config.jwt.expiracionStaff,
      audience: config.jwt.audienciaStaff,
      issuer: config.jwt.emisor,
    }
  );
}

/** Firma un token de corta duracion para un empleado autenticado por PIN. */
function firmarTokenEmpleado(empleado) {
  return jwt.sign(
    { sub: empleado.id, tipo: 'empleado', nombre: `${empleado.nombres} ${empleado.apellidos}` },
    config.jwt.secreto,
    {
      expiresIn: config.jwt.expiracionEmpleado,
      audience: config.jwt.audienciaEmpleado,
      issuer: config.jwt.emisor,
    }
  );
}

/**
 * Verifica un token contra una audiencia concreta.
 * Lanza `ErrorAplicacion` 401 si es invalido o expiro.
 */
function verificarToken(token, audiencia) {
  try {
    return jwt.verify(token, config.jwt.secreto, {
      audience: audiencia,
      issuer: config.jwt.emisor,
    });
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      throw errores.noAutenticado('La sesion expiro. Vuelva a iniciar sesion.', 'TOKEN_EXPIRADO');
    }
    throw errores.noAutenticado('Token invalido.', 'TOKEN_INVALIDO');
  }
}

module.exports = { firmarTokenStaff, firmarTokenEmpleado, verificarToken };
