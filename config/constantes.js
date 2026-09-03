'use strict';

/** Constantes de dominio compartidas por toda la aplicacion. */

const ROLES_STAFF = Object.freeze(['Admin', 'Técnico']);

const TIPOS_ACTOR = Object.freeze({
  EMPLEADO: 'Empleado',
  ADMIN: 'Admin',
  TECNICO: 'Técnico',
  SISTEMA: 'Sistema',
});

const ESTADOS_EQUIPO = Object.freeze({
  DISPONIBLE: 'Disponible',
  PRESTADO: 'Prestado',
  EN_REPARACION: 'En Reparación',
  EN_INSTALACION: 'En Instalación',
  DE_BAJA: 'De Baja',
});

/** RN01: solo un equipo Disponible puede prestarse. */
const ESTADOS_EQUIPO_NO_PRESTABLES = Object.freeze([
  ESTADOS_EQUIPO.PRESTADO,
  ESTADOS_EQUIPO.EN_REPARACION,
  ESTADOS_EQUIPO.EN_INSTALACION,
  ESTADOS_EQUIPO.DE_BAJA,
]);

const ESTADOS_PRESTAMO = Object.freeze({
  ACTIVO: 'Activo',
  DEVUELTO: 'Devuelto',
});

const ESTADOS_RETIRO = Object.freeze({
  ACTIVO: 'Activo', // todos los prestamos del retiro siguen activos
  PARCIAL: 'Parcial', // algunos equipos ya se devolvieron
  DEVUELTO: 'Devuelto', // todos devueltos
});

const TIPOS_CHECKLIST = Object.freeze({
  SALIDA: 'salida',
  RECEPCION: 'recepcion',
});

/**
 * Componentes fisicos evaluables por categoria de equipo.
 * El estado de cada componente lo registra y mantiene el area de TIC
 * (Admin / Tecnico); el Empleado solo lo consulta y lo acepta (RF02).
 * Al dar de alta un equipo se crean sus filas en `componente_equipo`.
 */
const COMPONENTES_POR_CATEGORIA = Object.freeze({
  Laptop: ['pantalla', 'teclado', 'touchpad', 'carcasa', 'bateria', 'puertos', 'cargador', 'encendido'],
  Monitor: ['pantalla', 'carcasa', 'puertos', 'botones', 'cable_poder'],
  Mouse: ['sensor', 'clic_izquierdo', 'clic_derecho', 'rueda', 'receptor'],
  Teclado: ['teclas', 'carcasa', 'cable', 'luz_indicadora'],
  Cargador: ['cable', 'conector', 'adaptador', 'led'],
  Proyector: ['lampara', 'lente', 'puertos', 'control_remoto', 'ventilacion', 'encendido'],
});

const CATEGORIAS_EQUIPO = Object.freeze(Object.keys(COMPONENTES_POR_CATEGORIA));

const ESTADOS_COMPONENTE = Object.freeze(['bueno', 'regular', 'malo']);

/** Un componente en 'malo' cuenta como dano (RN04). */
const ESTADO_COMPONENTE_CON_DANO = 'malo';

const AUTENTICACION = Object.freeze({
  LONGITUD_PIN: 6,
  MAX_INTENTOS_PIN: 3,
  BLOQUEO_PIN_MS: 15 * 60 * 1000, // RNF05
});

const ACCIONES_AUDITORIA = Object.freeze({
  LOGIN_PIN_EXITOSO: 'LOGIN_PIN_EXITOSO',
  LOGIN_PIN_FALLIDO: 'LOGIN_PIN_FALLIDO',
  LOGIN_PIN_BLOQUEADO: 'LOGIN_PIN_BLOQUEADO',
  LOGIN_STAFF_EXITOSO: 'LOGIN_STAFF_EXITOSO',
  LOGIN_STAFF_FALLIDO: 'LOGIN_STAFF_FALLIDO',
  RETIRO_REGISTRADO: 'RETIRO_REGISTRADO',
  PRESTAMO_REGISTRADO: 'PRESTAMO_REGISTRADO',
  DEVOLUCION_SOLICITADA: 'DEVOLUCION_SOLICITADA',
  PRESTAMO_DEVUELTO: 'PRESTAMO_DEVUELTO',
  EQUIPO_A_REPARACION: 'EQUIPO_A_REPARACION',
  ESTADO_COMPONENTE_ACTUALIZADO: 'ESTADO_COMPONENTE_ACTUALIZADO',
  INCIDENCIA_REPORTADA: 'INCIDENCIA_REPORTADA',
});

module.exports = {
  ROLES_STAFF,
  TIPOS_ACTOR,
  ESTADOS_EQUIPO,
  ESTADOS_EQUIPO_NO_PRESTABLES,
  ESTADOS_PRESTAMO,
  ESTADOS_RETIRO,
  TIPOS_CHECKLIST,
  COMPONENTES_POR_CATEGORIA,
  CATEGORIAS_EQUIPO,
  ESTADOS_COMPONENTE,
  ESTADO_COMPONENTE_CON_DANO,
  AUTENTICACION,
  ACCIONES_AUDITORIA,
};
