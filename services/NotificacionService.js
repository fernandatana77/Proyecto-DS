'use strict';

/**
 * Punto unico de notificaciones del sistema (prestamo formalizado, equipo a
 * reparacion, prestamo vencido, incidencia...).
 *
 * En v1 solo deja constancia en consola; el canal real (correo, push de la PWA)
 * se conecta despues sin tocar a los services que la invocan.
 */

function notificar(tipo, destinatario, datos = {}) {
  const marca = new Date().toISOString();
  console.log(`[NOTIFICACION ${marca}] ${tipo} -> ${destinatario}`, datos);
  return { entregada: false, tipo, destinatario, datos, fecha: marca };
}

function prestamoFormalizado(empleado, equipo, prestamo) {
  return notificar('PRESTAMO_FORMALIZADO', empleado.correo || `empleado:${empleado.id}`, {
    prestamoId: prestamo.id,
    equipo: equipo.codigo_interno,
  });
}

function equipoEnReparacion(equipo, motivo) {
  return notificar('EQUIPO_EN_REPARACION', 'soporte-tic', {
    equipo: equipo.codigo_interno,
    motivo,
  });
}

module.exports = { notificar, prestamoFormalizado, equipoEnReparacion };
