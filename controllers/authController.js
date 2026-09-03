'use strict';

const { TIPOS_ACTOR, ACCIONES_AUDITORIA, AUTENTICACION } = require('../config/constantes');
const { validarPin } = require('../utils/validacion');
const { hashPin, passwordCoincide } = require('../utils/hash');
const { firmarTokenEmpleado, firmarTokenStaff } = require('../utils/jwt');
const { errores } = require('../utils/errores');
const {
  registrarIntentoFallido,
  reiniciar,
} = require('../middlewares/rateLimitPIN');

const empleadoModel = require('../models/empleadoModel');
const usuarioSistemaModel = require('../models/usuarioSistemaModel');
const AuditoriaService = require('../services/AuditoriaService');

/**
 * POST /api/auth/pin
 * HU01 - El empleado inicia sesion SOLO con su PIN de 6 digitos.
 * El middleware rateLimitPIN ya corto la peticion si la IP esta bloqueada (RNF05).
 */
async function loginPin(req, res, next) {
  try {
    const pin = validarPin(req.body?.pin);
    const empleado = empleadoModel.buscarActivoPorHashPin(hashPin(pin));

    if (!empleado) {
      const control = registrarIntentoFallido(req);
      AuditoriaService.registrar({
        actorTipo: TIPOS_ACTOR.SISTEMA,
        accion: control.bloqueado
          ? ACCIONES_AUDITORIA.LOGIN_PIN_BLOQUEADO
          : ACCIONES_AUDITORIA.LOGIN_PIN_FALLIDO,
        entidad: 'empleado',
        detalle: { intentosRestantes: control.intentosRestantes },
        ip: req.ip,
      });

      if (control.bloqueado) {
        throw errores.demasiadasSolicitudes(
          `Demasiados intentos fallidos. Acceso bloqueado ${AUTENTICACION.BLOQUEO_PIN_MS / 60000} minutos.`,
          'PIN_BLOQUEADO'
        );
      }
      throw errores.noAutenticado(
        `PIN incorrecto. Le quedan ${control.intentosRestantes} intento(s).`,
        'PIN_INCORRECTO'
      );
    }

    reiniciar(req);
    const token = firmarTokenEmpleado(empleado);

    AuditoriaService.registrar({
      actorTipo: TIPOS_ACTOR.EMPLEADO,
      actorId: empleado.id,
      accion: ACCIONES_AUDITORIA.LOGIN_PIN_EXITOSO,
      entidad: 'empleado',
      entidadId: empleado.id,
      ip: req.ip,
    });

    res.status(200).json({
      token,
      empleado: {
        id: empleado.id,
        nombres: empleado.nombres,
        apellidos: empleado.apellidos,
        cargo: empleado.cargo,
        sede: empleado.sede,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/auth/login
 * RF01 - Admin / Tecnico se autentican con usuario + contrasena.
 */
async function loginStaff(req, res, next) {
  try {
    const usuario = String(req.body?.usuario ?? '').trim();
    const password = String(req.body?.password ?? '');
    if (!usuario || !password) {
      throw errores.solicitudInvalida('Usuario y contrasena son obligatorios.');
    }

    const cuenta = usuarioSistemaModel.buscarActivoPorUsuario(usuario);
    if (!cuenta || !passwordCoincide(password, cuenta.password_hash)) {
      AuditoriaService.registrar({
        actorTipo: TIPOS_ACTOR.SISTEMA,
        accion: ACCIONES_AUDITORIA.LOGIN_STAFF_FALLIDO,
        entidad: 'usuario_sistema',
        detalle: { usuario },
        ip: req.ip,
      });
      throw errores.noAutenticado('Usuario o contrasena incorrectos.');
    }

    const token = firmarTokenStaff(cuenta);
    AuditoriaService.registrar({
      actorTipo: cuenta.rol,
      actorId: cuenta.id,
      accion: ACCIONES_AUDITORIA.LOGIN_STAFF_EXITOSO,
      entidad: 'usuario_sistema',
      entidadId: cuenta.id,
      ip: req.ip,
    });

    res.status(200).json({
      token,
      usuario: { id: cuenta.id, usuario: cuenta.usuario, rol: cuenta.rol },
    });
  } catch (error) {
    next(error);
  }
}

module.exports = { loginPin, loginStaff };
