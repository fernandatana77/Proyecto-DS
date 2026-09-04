'use strict';

/**
 * Carga y valida la configuracion desde variables de entorno.
 * En local se inyectan con `node --env-file-if-exists=.env` (ver package.json);
 * en un hosting (Render, etc.) se configuran en el panel del servicio.
 */

// Valores que NUNCA deben quedar en produccion (placeholders del .env.example
// y los fallback de desarrollo de este archivo).
const VALORES_INSEGUROS = new Set([
  'cambia-esto-por-un-secreto-largo-y-aleatorio',
  'cambia-esto-por-otra-cadena-larga-y-aleatoria',
  'secreto-de-desarrollo-no-usar-en-produccion',
  'pimienta-de-desarrollo-no-usar-en-produccion',
]);

const entorno = process.env.ENTORNO || 'desarrollo';
const esProduccion = entorno === 'produccion' || process.env.NODE_ENV === 'production';

const jwtSecret = process.env.JWT_SECRET || 'secreto-de-desarrollo-no-usar-en-produccion';
const pinPepper = process.env.PIN_PEPPER || 'pimienta-de-desarrollo-no-usar-en-produccion';

if (esProduccion) {
  const faltantes = [];
  if (!process.env.JWT_SECRET || VALORES_INSEGUROS.has(process.env.JWT_SECRET)) faltantes.push('JWT_SECRET');
  if (!process.env.PIN_PEPPER || VALORES_INSEGUROS.has(process.env.PIN_PEPPER)) faltantes.push('PIN_PEPPER');
  if (faltantes.length) {
    throw new Error(
      `Configuracion invalida en produccion: defina ${faltantes.join(' y ')} ` +
        'con valores propios largos y aleatorios en las variables de entorno.'
    );
  }
}

const config = {
  entorno,
  esProduccion,
  // Render (y la mayoria de hostings) inyecta PORT; en local se usa PUERTO o 3000.
  puerto: Number(process.env.PORT || process.env.PUERTO || 3000),
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
  // Al arrancar, si la BD esta vacia, cargar datos demo (util en un deploy
  // nuevo). Se desactiva con SEMBRAR_DEMO=off.
  sembrarDemoSiVacia: process.env.SEMBRAR_DEMO !== 'off',
};

module.exports = config;
