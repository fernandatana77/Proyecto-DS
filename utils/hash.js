'use strict';

const crypto = require('node:crypto');
const config = require('../config/config');

/**
 * Hash del PIN de empleado.
 *
 * El login de empleado se hace SOLO con el PIN (sin identificador), asi que la
 * busqueda tiene que ser directa: se usa HMAC-SHA256(pin, PIN_PEPPER), que es
 * determinista, permite un indice UNIQUE sobre `pin_hash` y una consulta O(1).
 * El "pepper" vive en la config del servidor, no en la BD.
 */
function hashPin(pinPlano) {
  return crypto.createHmac('sha256', config.pinPepper).update(String(pinPlano)).digest('hex');
}

/** Comparacion en tiempo constante de dos hashes de PIN. */
function pinCoincide(pinPlano, hashGuardado) {
  const calculado = Buffer.from(hashPin(pinPlano), 'hex');
  const guardado = Buffer.from(String(hashGuardado || ''), 'hex');
  if (calculado.length !== guardado.length) return false;
  return crypto.timingSafeEqual(calculado, guardado);
}

/** Hash de contrasena de staff con scrypt + salt aleatorio. Formato: `scrypt$<salt>$<hash>`. */
function hashPassword(passwordPlano) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivado = crypto.scryptSync(passwordPlano, salt, 64).toString('hex');
  return `scrypt$${salt}$${derivado}`;
}

/** Verifica una contrasena de staff contra el formato `scrypt$<salt>$<hash>`. */
function passwordCoincide(passwordPlano, hashGuardado) {
  const [algoritmo, salt, derivadoGuardado] = String(hashGuardado || '').split('$');
  if (algoritmo !== 'scrypt' || !salt || !derivadoGuardado) return false;
  const derivado = crypto.scryptSync(passwordPlano, salt, 64);
  const guardado = Buffer.from(derivadoGuardado, 'hex');
  if (derivado.length !== guardado.length) return false;
  return crypto.timingSafeEqual(derivado, guardado);
}

module.exports = { hashPin, pinCoincide, hashPassword, passwordCoincide };
