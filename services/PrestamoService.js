'use strict';

const { enTransaccion } = require('../config/database');
const {
  ESTADOS_EQUIPO,
  ESTADOS_EQUIPO_NO_PRESTABLES,
  ESTADOS_RETIRO,
  TIPOS_CHECKLIST,
  TIPOS_ACTOR,
  ACCIONES_AUDITORIA,
} = require('../config/constantes');
const { errores } = require('../utils/errores');
const { pinCoincide } = require('../utils/hash');
const {
  tieneDano,
  componentesAMapa,
  normalizarEntradaComponentes,
} = require('../utils/estadoEquipo');

const equipoModel = require('../models/equipoModel');
const componenteEquipoModel = require('../models/componenteEquipoModel');
const retiroModel = require('../models/retiroModel');
const prestamoModel = require('../models/prestamoModel');
const checklistEstadoModel = require('../models/checklistEstadoModel');
const incidenciaModel = require('../models/incidenciaModel');

const AuditoriaService = require('./AuditoriaService');
const NotificacionService = require('./NotificacionService');

/**
 * Reglas de negocio de prestamos / retiros. Unico lugar donde se decide si un
 * retiro puede formalizarse o un prestamo cerrarse. Los controllers solo invocan.
 *
 *  - RN01: solo un equipo 'Disponible' puede prestarse.
 *  - RF02 / RN02: no hay retiro valido sin la foto del estado (checklist de
 *    salida) Y el reingreso del PIN del empleado (aceptacion explicita).
 *  - RN04: devolucion con dano o incidencia abierta -> equipo 'En Reparación'.
 *
 * El estado fisico de los componentes lo mantiene TIC en `componente_equipo`;
 * el empleado NUNCA lo asigna: al retirar solo acepta la foto de ese estado.
 */

/** Valida que un equipo se pueda retirar; devuelve el equipo. Lanza si no. */
function asegurarEquipoPrestable(equipoId) {
  const equipo = equipoModel.buscarPorId(equipoId);
  if (!equipo) {
    throw errores.noEncontrado(`El equipo #${equipoId} no existe.`, 'EQUIPO_NO_ENCONTRADO');
  }
  if (ESTADOS_EQUIPO_NO_PRESTABLES.includes(equipo.estado) || equipo.estado !== ESTADOS_EQUIPO.DISPONIBLE) {
    throw errores.conflicto(
      `El equipo ${equipo.codigo_interno} esta en estado "${equipo.estado}" y no puede prestarse.`,
      'EQUIPO_NO_DISPONIBLE'
    );
  }
  if (prestamoModel.existePrestamoActivoDeEquipo(equipoId)) {
    throw errores.conflicto(
      `El equipo ${equipo.codigo_interno} ya tiene un prestamo activo.`,
      'EQUIPO_CON_PRESTAMO_ACTIVO'
    );
  }
  return equipo;
}

/**
 * HU01 - Formaliza un retiro (uno o varios equipos) iniciado por el empleado.
 *
 * @param {object} params
 * @param {object} params.empleado        empleado autenticado por token PIN
 * @param {number[]} params.equipoIds     equipos del carrito
 * @param {string} params.pinReingresado  PIN que el empleado vuelve a escribir (RN02)
 * @param {string} [params.observaciones]
 * @param {string} [params.ip]
 * @returns {{ retiro: object, prestamos: object[], equipos: object[] }}
 */
function registrarRetiroConPin({ empleado, equipoIds, pinReingresado, observaciones, ip }) {
  // --- RN02: aceptacion explicita: el PIN reingresado debe ser el del empleado ---
  if (!pinCoincide(pinReingresado, empleado.pin_hash)) {
    AuditoriaService.registrar({
      actorTipo: TIPOS_ACTOR.EMPLEADO,
      actorId: empleado.id,
      accion: ACCIONES_AUDITORIA.LOGIN_PIN_FALLIDO,
      entidad: 'retiro',
      detalle: { motivo: 'PIN de aceptacion incorrecto', equipoIds },
      ip,
    });
    throw errores.noAutenticado(
      'El PIN de aceptacion no coincide. El retiro no fue formalizado.',
      'PIN_ACEPTACION_INVALIDO'
    );
  }

  // --- Validar todos los equipos ANTES de tocar nada (RN01) ---
  const equipos = equipoIds.map(asegurarEquipoPrestable);
  const componentesPorEquipo = new Map(
    equipos.map((eq) => [eq.id, componenteEquipoModel.listarPorEquipo(eq.id)])
  );

  // --- Todo o nada: retiro + (checklist salida + prestamo + estado equipo) x N ---
  const resultado = enTransaccion(() => {
    const retiro = retiroModel.crear({ empleadoId: empleado.id, observaciones: observaciones || null });
    const prestamos = [];

    for (const equipo of equipos) {
      const filasComponentes = componentesPorEquipo.get(equipo.id);
      const fotoEstado = componentesAMapa(filasComponentes);
      const danoAlRetirar = tieneDano(filasComponentes);

      // Checklist de SALIDA = foto del estado que TIC tenia registrado y que el
      // empleado acepta. No lo edita el empleado (realizado_por = Sistema).
      const checklist = checklistEstadoModel.crear({
        tipo: TIPOS_CHECKLIST.SALIDA,
        items: fotoEstado,
        observaciones: `Estado registrado por TIC. Aceptado por el empleado ${empleado.id} en el retiro ${retiro.id}.`,
        tieneDano: danoAlRetirar ? 1 : 0,
        realizadoPorTipo: TIPOS_ACTOR.SISTEMA,
        realizadoPorId: null,
      });

      const prestamo = prestamoModel.crear({
        retiroId: retiro.id,
        empleadoId: empleado.id,
        equipoId: equipo.id,
        checklistSalidaId: checklist.id,
      });
      checklistEstadoModel.asignarPrestamo(checklist.id, prestamo.id);
      equipoModel.actualizarEstado(equipo.id, ESTADOS_EQUIPO.PRESTADO);

      AuditoriaService.registrar({
        actorTipo: TIPOS_ACTOR.EMPLEADO,
        actorId: empleado.id,
        accion: ACCIONES_AUDITORIA.PRESTAMO_REGISTRADO,
        entidad: 'prestamo',
        entidadId: prestamo.id,
        detalle: { retiroId: retiro.id, equipoId: equipo.id, equipoCodigo: equipo.codigo_interno, checklistConDano: danoAlRetirar },
        ip,
      });
      prestamos.push(prestamo);
    }

    AuditoriaService.registrar({
      actorTipo: TIPOS_ACTOR.EMPLEADO,
      actorId: empleado.id,
      accion: ACCIONES_AUDITORIA.RETIRO_REGISTRADO,
      entidad: 'retiro',
      entidadId: retiro.id,
      detalle: { equipoIds, equiposCodigos: equipos.map((e) => e.codigo_interno) },
      ip,
    });

    return { retiro, prestamos };
  });

  const equiposActualizados = equipos.map((e) => equipoModel.buscarPorId(e.id));
  NotificacionService.prestamoFormalizado(empleado, equiposActualizados[0], resultado.retiro);
  return { ...resultado, equipos: equiposActualizados };
}

/**
 * HU04 - Registra la devolucion de un prestamo activo con el checklist de
 * recepcion que constata TIC.
 * RN04: si el checklist marca dano o hay una incidencia abierta, el equipo pasa
 * automaticamente a 'En Reparación'; si no, vuelve a 'Disponible'.
 *
 * @param {object} params
 * @param {number} params.prestamoId
 * @param {object} params.checklistRecepcion  `{ items: { <componente>: 'bueno'|... }, observaciones }`
 * @param {{ tipo: string, id?: number }} params.actor  staff que recibe
 */
function registrarDevolucion({ prestamoId, checklistRecepcion, actor, ip }) {
  const prestamo = prestamoModel.buscarPorId(prestamoId);
  if (!prestamo) throw errores.noEncontrado('El prestamo indicado no existe.', 'PRESTAMO_NO_ENCONTRADO');
  if (prestamo.estado !== 'Activo') throw errores.conflicto('El prestamo ya fue devuelto.', 'PRESTAMO_YA_DEVUELTO');

  const equipo = equipoModel.buscarPorId(prestamo.equipo_id);
  const componentesRecepcion = normalizarEntradaComponentes(equipo.categoria, checklistRecepcion);
  const danoEnChecklist = tieneDano(componentesRecepcion);
  const incidenciaAbierta = incidenciaModel.existeIncidenciaAbiertaDePrestamo(prestamoId);
  const requiereReparacion = danoEnChecklist || incidenciaAbierta;

  const resultado = enTransaccion(() => {
    const checklist = checklistEstadoModel.crear({
      prestamoId,
      tipo: TIPOS_CHECKLIST.RECEPCION,
      items: Object.fromEntries(componentesRecepcion.map((c) => [c.nombre, { estado: c.estado, observacion: c.observacion }])),
      observaciones: (checklistRecepcion && checklistRecepcion.observaciones) || null,
      tieneDano: danoEnChecklist ? 1 : 0,
      realizadoPorTipo: actor.tipo,
      realizadoPorId: actor.id || null,
    });

    // TIC actualiza el estado fisico registrado del equipo segun lo constatado.
    for (const comp of componentesRecepcion) {
      componenteEquipoModel.actualizarEstado({
        equipoId: equipo.id,
        nombre: comp.nombre,
        estado: comp.estado,
        observacion: comp.observacion || null,
        actualizadoPorId: actor.id || null,
      });
    }

    const prestamoActualizado = prestamoModel.registrarDevolucion(prestamoId, { checklistRecepcionId: checklist.id });

    const nuevoEstadoEquipo = requiereReparacion ? ESTADOS_EQUIPO.EN_REPARACION : ESTADOS_EQUIPO.DISPONIBLE;
    const equipoActualizado = equipoModel.actualizarEstado(equipo.id, nuevoEstadoEquipo);

    // Estado del retiro: Parcial mientras queden prestamos activos, si no Devuelto.
    if (prestamo.retiro_id) {
      const quedanActivos = prestamoModel.contarActivosDeRetiro(prestamo.retiro_id);
      retiroModel.actualizarEstado(
        prestamo.retiro_id,
        quedanActivos > 0 ? ESTADOS_RETIRO.PARCIAL : ESTADOS_RETIRO.DEVUELTO
      );
    }

    AuditoriaService.registrar({
      actorTipo: actor.tipo,
      actorId: actor.id || null,
      accion: ACCIONES_AUDITORIA.PRESTAMO_DEVUELTO,
      entidad: 'prestamo',
      entidadId: prestamoId,
      detalle: { danoEnChecklist, incidenciaAbierta, nuevoEstadoEquipo },
      ip,
    });
    if (requiereReparacion) {
      AuditoriaService.registrar({
        actorTipo: TIPOS_ACTOR.SISTEMA,
        accion: ACCIONES_AUDITORIA.EQUIPO_A_REPARACION,
        entidad: 'equipo',
        entidadId: equipo.id,
        detalle: { motivo: danoEnChecklist ? 'Dano en checklist de recepcion' : 'Incidencia abierta', prestamoId },
        ip,
      });
    }

    return { prestamo: prestamoActualizado, checklistRecepcion: checklist, equipo: equipoActualizado, requiereReparacion };
  });

  if (resultado.requiereReparacion) {
    NotificacionService.equipoEnReparacion(equipo, 'Devolucion con dano / incidencia');
  }
  return resultado;
}

/**
 * HU04 paso 1 - El empleado marca que va a devolver un equipo. No cierra el
 * prestamo (eso lo hace TIC al certificar la recepcion): solo lo pone en la cola
 * y avisa. Idempotente.
 *
 * @param {object} params
 * @param {object} params.empleado    empleado autenticado por token PIN
 * @param {number} params.prestamoId
 */
function solicitarDevolucion({ empleado, prestamoId, ip }) {
  const prestamo = prestamoModel.buscarPorId(prestamoId);
  if (!prestamo) throw errores.noEncontrado('El prestamo indicado no existe.', 'PRESTAMO_NO_ENCONTRADO');
  if (prestamo.empleado_id !== empleado.id) {
    throw errores.prohibido('Ese prestamo no le pertenece.', 'PRESTAMO_AJENO');
  }
  if (prestamo.estado !== 'Activo') {
    throw errores.conflicto('El equipo ya fue devuelto.', 'PRESTAMO_YA_DEVUELTO');
  }
  if (prestamo.devolucion_solicitada) {
    return { prestamo, yaSolicitada: true };
  }

  const actualizado = prestamoModel.marcarDevolucionSolicitada(prestamoId);
  AuditoriaService.registrar({
    actorTipo: TIPOS_ACTOR.EMPLEADO,
    actorId: empleado.id,
    accion: ACCIONES_AUDITORIA.DEVOLUCION_SOLICITADA,
    entidad: 'prestamo',
    entidadId: prestamoId,
    detalle: { equipoId: prestamo.equipo_id },
    ip,
  });
  NotificacionService.notificar('DEVOLUCION_SOLICITADA', 'soporte-tic', {
    prestamoId,
    equipoId: prestamo.equipo_id,
    empleadoId: empleado.id,
  });
  return { prestamo: actualizado, yaSolicitada: false };
}

module.exports = { registrarRetiroConPin, registrarDevolucion, solicitarDevolucion };
