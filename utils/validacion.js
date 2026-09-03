'use strict';

const { AUTENTICACION } = require('../config/constantes');
const { errores } = require('./errores');

/** Verifica que el PIN sea exactamente N digitos. Devuelve el PIN como string. */
function validarPin(valor) {
  const pin = String(valor ?? '').trim();
  const patron = new RegExp(`^\\d{${AUTENTICACION.LONGITUD_PIN}}$`);
  if (!patron.test(pin)) {
    throw errores.solicitudInvalida(
      `El PIN debe tener exactamente ${AUTENTICACION.LONGITUD_PIN} digitos.`,
      'PIN_FORMATO_INVALIDO'
    );
  }
  return pin;
}

/** Valida un entero positivo (ids de recursos). */
function validarIdEntero(valor, nombreCampo = 'id') {
  const numero = Number(valor);
  if (!Number.isInteger(numero) || numero <= 0) {
    throw errores.solicitudInvalida(`El campo "${nombreCampo}" debe ser un entero positivo.`);
  }
  return numero;
}

/**
 * Valida la lista de equipos del carrito de retiro: array no vacio de enteros
 * positivos, sin duplicados. Devuelve `number[]`.
 */
function validarListaIdsEquipo(valor) {
  if (!Array.isArray(valor) || valor.length === 0) {
    throw errores.solicitudInvalida(
      'Debe seleccionar al menos un equipo para el retiro.',
      'RETIRO_SIN_EQUIPOS'
    );
  }
  if (valor.length > 20) {
    throw errores.solicitudInvalida('No se pueden retirar mas de 20 equipos en una sola operacion.');
  }
  const ids = valor.map((v, i) => validarIdEntero(v, `equipoIds[${i}]`));
  if (new Set(ids).size !== ids.length) {
    throw errores.solicitudInvalida('La lista de equipos tiene ids repetidos.', 'RETIRO_EQUIPOS_DUPLICADOS');
  }
  return ids;
}

module.exports = { validarPin, validarIdEntero, validarListaIdsEquipo };
