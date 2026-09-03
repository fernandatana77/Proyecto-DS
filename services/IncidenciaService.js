'use strict';

const {
  TIPOS_ACTOR,
  ACCIONES_AUDITORIA,
  SEVERIDADES_TRIAGE,
  ESTADOS_INCIDENCIA,
} = require('../config/constantes');
const { errores } = require('../utils/errores');

const incidenciaModel = require('../models/incidenciaModel');
const prestamoModel = require('../models/prestamoModel');
const equipoModel = require('../models/equipoModel');

const AuditoriaService = require('./AuditoriaService');
const NotificacionService = require('./NotificacionService');

/**
 * Reglas de negocio de incidencias (HU03).
 *
 * Principio: el Empleado SOLO describe el problema en texto libre. No clasifica
 * la severidad ni cambia el estado del equipo. La incidencia nace
 * 'sin clasificar' / 'Abierta'; TIC la tría después de revisarla.
 *
 * Reportar una incidencia NO toca `equipo.estado`. El equipo sigue asignado al
 * empleado hasta la devolución; ahí RN04 (en PrestamoService) manda el equipo a
 * 'En Reparación' si queda alguna incidencia abierta.
 */

const LARGO_MAX_DESCRIPCION = 1000;
const LARGO_MIN_DESCRIPCION = 5;

/**
 * HU03 - El empleado reporta una incidencia sobre uno de sus préstamos activos.
 * @param {object} params
 * @param {object} params.empleado      empleado autenticado por token PIN
 * @param {number} params.prestamoId
 * @param {string} params.descripcion   texto libre
 */
function reportarIncidencia({ empleado, prestamoId, descripcion, ip }) {
  const texto = String(descripcion ?? '').trim();
  if (texto.length < LARGO_MIN_DESCRIPCION) {
    throw errores.solicitudInvalida(
      `Describa el problema con al menos ${LARGO_MIN_DESCRIPCION} caracteres.`,
      'DESCRIPCION_INCIDENCIA_INVALIDA'
    );
  }

  const prestamo = prestamoModel.buscarPorId(prestamoId);
  if (!prestamo) {
    throw errores.noEncontrado('El préstamo indicado no existe.', 'PRESTAMO_NO_ENCONTRADO');
  }
  if (prestamo.empleado_id !== empleado.id) {
    throw errores.prohibido('Ese préstamo no le pertenece.', 'PRESTAMO_AJENO');
  }
  if (prestamo.estado !== 'Activo') {
    throw errores.conflicto(
      'El equipo ya fue devuelto; reporte la incidencia al área de TIC directamente.',
      'PRESTAMO_YA_DEVUELTO'
    );
  }

  const incidencia = incidenciaModel.crear({
    prestamoId,
    equipoId: prestamo.equipo_id,
    reportadoPorTipo: TIPOS_ACTOR.EMPLEADO,
    reportadoPorId: empleado.id,
    descripcion: texto.slice(0, LARGO_MAX_DESCRIPCION),
  });

  const equipo = equipoModel.buscarPorId(prestamo.equipo_id);
  AuditoriaService.registrar({
    actorTipo: TIPOS_ACTOR.EMPLEADO,
    actorId: empleado.id,
    accion: ACCIONES_AUDITORIA.INCIDENCIA_REPORTADA,
    entidad: 'incidencia',
    entidadId: incidencia.id,
    detalle: { prestamoId, equipoId: prestamo.equipo_id, equipoCodigo: equipo.codigo_interno },
    ip,
  });
  NotificacionService.incidenciaReportada(equipo, incidencia);

  return incidencia;
}

/** Incidencias reportadas por el empleado (con estado y clasificación de TIC). */
function listarDelEmpleado(empleadoId) {
  return incidenciaModel.listarPorEmpleado(empleadoId);
}

/** Cola de incidencias para TIC (filtros opcionales estado / severidad / prestamoId). */
function listarParaTIC(filtros) {
  return incidenciaModel.listarParaTIC(filtros);
}

/**
 * HU03 - TIC tría una incidencia: asigna/ajusta severidad, mueve el estado y
 * agrega notas. Al menos uno de los campos debe venir.
 * @param {object} params
 * @param {number} params.incidenciaId
 * @param {{ tipo: string, id?: number }} params.actor  staff
 * @param {string} [params.severidad]  'baja' | 'media' | 'alta'
 * @param {string} [params.estado]     'Abierta' | 'En proceso' | 'Cerrada'
 * @param {string} [params.notasTic]
 */
function triarIncidencia({ incidenciaId, actor, severidad, estado, notasTic, ip }) {
  const incidencia = incidenciaModel.buscarPorId(incidenciaId);
  if (!incidencia) {
    throw errores.noEncontrado('La incidencia indicada no existe.', 'INCIDENCIA_NO_ENCONTRADA');
  }

  const nuevaSeveridad = severidad === undefined ? incidencia.severidad : severidad;
  const nuevoEstado = estado === undefined ? incidencia.estado : estado;
  const nuevasNotas = notasTic === undefined ? incidencia.notas_tic : String(notasTic).trim().slice(0, 1000);

  if (severidad !== undefined && !SEVERIDADES_TRIAGE.includes(severidad)) {
    throw errores.solicitudInvalida(
      `La severidad debe ser una de: ${SEVERIDADES_TRIAGE.join(', ')}.`,
      'SEVERIDAD_INVALIDA'
    );
  }
  if (estado !== undefined && !Object.values(ESTADOS_INCIDENCIA).includes(estado)) {
    throw errores.solicitudInvalida(
      `El estado debe ser uno de: ${Object.values(ESTADOS_INCIDENCIA).join(', ')}.`,
      'ESTADO_INCIDENCIA_INVALIDO'
    );
  }

  const seCierra = nuevoEstado === ESTADOS_INCIDENCIA.CERRADA;
  const ahora = new Date().toISOString().replace('T', ' ').slice(0, 19);

  const actualizada = incidenciaModel.actualizarTriage(incidenciaId, {
    severidad: nuevaSeveridad,
    estado: nuevoEstado,
    notasTic: nuevasNotas,
    atendidaPorId: actor.id || null,
    // se cierra: conserva la fecha previa o pone la de ahora. Se reabre: se limpia.
    fechaCierre: seCierra ? incidencia.fecha_cierre || ahora : null,
  });

  const cambios = {
    severidad: severidad !== undefined && severidad !== incidencia.severidad ? severidad : undefined,
    estado: estado !== undefined && estado !== incidencia.estado ? estado : undefined,
    notas: notasTic !== undefined || undefined,
  };
  AuditoriaService.registrar({
    actorTipo: actor.tipo,
    actorId: actor.id || null,
    accion:
      seCierra && incidencia.estado !== ESTADOS_INCIDENCIA.CERRADA
        ? ACCIONES_AUDITORIA.INCIDENCIA_CERRADA
        : ACCIONES_AUDITORIA.INCIDENCIA_ACTUALIZADA,
    entidad: 'incidencia',
    entidadId: incidenciaId,
    detalle: { cambios },
    ip,
  });

  return actualizada;
}

module.exports = { reportarIncidencia, listarDelEmpleado, listarParaTIC, triarIncidencia };
