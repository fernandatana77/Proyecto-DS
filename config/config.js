'use strict';

/**
 * Carga y valida la configuracion desde variables de entorno.
 * Las variables se inyectan con `node --env-file=.env` (ver package.json).
 */

const VALORES_EJEMPLO = new Set([
  'cambia-esto-por-un-secreto-largo-y-aleatorio',
  'cambia-esto-por-otra-cadena-larga-y-aleatoria',
]);

const entorno = process.env.ENTORNO || 'desarrollo';
const esProduccion = entorno === 'produccion';

const jwtSecret = process.env.JWT_SECRET || 'secreto-de-desarrollo-no-usar-en-produccion';
const pinPepper = process.env.PIN_PEPPER || 'pimienta-de-desarrollo-no-usar-en-produccion';

if (esProduccion && (VALORES_EJEMPLO.has(jwtSecret) || VALORES_EJEMPLO.has(pinPepper))) {
  throw new Error(
    'Configuracion invalida: en produccion hay que definir JWT_SECRET y PIN_PEPPER con valores propios.'
  );
}

const config = {
  entorno,
  esProduccion,
  puerto: Number(process.env.PUERTO || 3000),
  rutaBaseDatos: process.env.DB_RUTA || './data/inventario.db',
  jwt: {
    secreto: jwtSecret,
    expiracionStaff: process.env.JWT_EXPIRACION_STAFF || '8h',
    expiracionEmpleado: process.env.JWT_EXPIRACION_EMPLEADO || '20m',
    audienciaStaff: 'staff',
    audienciaEmpleado: 'empleado-pin',
    emisor: 'sistema-inventario-tic',
  },
  pinPepper,
};

module.exports = config;
