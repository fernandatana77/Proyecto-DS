'use strict';

/**
 * Carga y valida la configuración desde variables de entorno.
 * En local se inyectan con `node --env-file-if-exists=.env` (ver package.json);
 * en un hosting (Render, etc.) se configuran en el panel del servicio.
 */

// Valores que NUNCA deben quedar en producción
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
      `Configuración inválida en producción: defina ${faltantes.join(' y ')} ` +
        'con valores propios largos y aleatorios en las variables de entorno.'
    );
  }
}

const config = {
  entorno,
  esProduccion,
  puerto: Number(process.env.PORT || process.env.PUERTO || 3000),
  // URL de conexion a PostgreSQL (Render inyecta DATABASE_URL automaticamente)
  databaseUrl: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/inventario_tic',
  jwt: {
    secreto: jwtSecret,
    expiracionStaff: process.env.JWT_EXPIRACION_STAFF || '8h',
    expiracionEmpleado: process.env.JWT_EXPIRACION_EMPLEADO || '20m',
    audienciaStaff: 'staff',
    audienciaEmpleado: 'empleado-pin',
    emisor: 'sistema-inventario-tic',
  },
  pinPepper,
  sembrarDemoSiVacia: process.env.SEMBRAR_DEMO !== 'off',
};

module.exports = config;