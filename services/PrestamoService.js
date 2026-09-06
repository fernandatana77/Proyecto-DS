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

/** Valida que un equipo se pueda retirar; devuelve el equipo. Lanza si no. */
async function asegurarEquipoPrestable(equipoId) {
  const equipo = await equipoModel.buscarPorId(equipoId);
  if (!equipo) {
    throw errores.noEncontrado(`El equipo #${equipoId} no existe.`, 'EQUIPO_NO_ENCONTRADO');
  }
  if (ESTADOS_EQUIPO_NO_PRESTABLES.includes(equipo.estado) || equipo.estado !== ESTADOS_EQUIPO.DISPONIBLE) {
    throw errores.conflicto(
      `El equipo ${equipo.codigo_interno} esta en estado "${equipo.estado}" y no puede prestarse.`,
      'EQUIPO_NO_DISPONIBLE'
    );
  }
  const tieneActivo = await prestamoModel.existePrestamoActivoDeEquipo(equipoId);
  if (tieneActivo) {
    throw errores.conflicto(
      `El equipo ${equipo.codigo_interno} ya tiene un prestamo activo.`,
      'EQUIPO_CON_PRESTAMO_ACTIVO'
    );
  }
  return equipo;
}

/** HU01 - Formaliza un retiro (uno o varios equipos) iniciado por el empleado. */
async function registrarRetiroConPin({ empleado, equipoIds, pinReingresado, observaciones, ip }) {
  if (!pinCoincide(pinReingresado, empleado.pin_hash)) {
    await AuditoriaService.registrar({
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

  const equipos = await Promise.all(equipoIds.map(asegurarEquipoPrestable));
  const componentesPorEquipo = new Map();

  for (const eq of equipos) {
    const componentes = await componenteEquipoModel.listarPorEquipo(eq.id);
    componentesPorEquipo.set(eq.id, componentes);
  }

  const resultado = await enTransaccion(async () => {
    const retiro = await retiroModel.crear({ empleadoId: empleado.id, observaciones: observaciones || null });
    const prestamos = [];

    for (const equipo of equipos) {
      const filasComponentes = componentesPorEquipo.get(equipo.id);
      const fotoEstado = componentesAMapa(filasComponentes);
      const danoAlRetirar = tieneDano(filasComponentes);

      const checklist = await checklistEstadoModel.crear({
        tipo: TIPOS_CHECKLIST.SALIDA,
        items: fotoEstado,
        observaciones: `Estado registrado por TIC. Aceptado por el empleado ${empleado.id} en el retiro ${retiro.id}.`,
        tieneDano: danoAlRetirar ? 1 : 0,
        realizadoPorTipo: TIPOS_ACTOR.SISTEMA,
        realizadoPorId: null,
      });

      const prestamo = await prestamoModel.crear({
        retiroId: retiro.id,
        empleadoId: empleado.id,
        equipoId: equipo.id,
        checklistSalidaId: checklist.id,
      });

      await checklistEstadoModel.asignarPrestamo(checklist.id, prestamo.id);
      await equipoModel.actualizarEstado(equipo.id, ESTADOS_EQUIPO.PRESTADO);

      await AuditoriaService.registrar({
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

    await AuditoriaService.registrar({
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

  const equiposActualizados = await Promise.all(equipos.map((e) => equipoModel.buscarPorId(e.id)));
  NotificacionService.prestamoFormalizado(empleado, equiposActualizados[0], resultado.retiro);
  return { ...resultado, equipos: equiposActualizados };
}

/** HU04 - Registra la devolucion de un prestamo activo. */
async function registrarDevolucion({ prestamoId, checklistRecepcion, actor, ip }) {
  const prestamo = await prestamoModel.buscarPorId(prestamoId);
  if (!prestamo) throw errores.noEncontrado('El prestamo indicado no existe.', 'PRESTAMO_NO_ENCONTRADO');
  if (prestamo.estado !== 'Activo') throw errores.conflicto('El prestamo ya fue devuelto.', 'PRESTAMO_YA_DEVUELTO');

  const equipo = await equipoModel.buscarPorId(prestamo.equipo_id);
  const componentesRecepcion = normalizarEntradaComponentes(equipo.categoria, checklistRecepcion);
  const danoEnChecklist = tieneDano(componentesRecepcion);
  const incidenciaAbierta = await incidenciaModel.existeIncidenciaAbiertaDePrestamo(prestamoId);
  const requiereReparacion = danoEnChecklist || incidenciaAbierta;

  const resultado = await enTransaccion(async () => {
    const checklist = await checklistEstadoModel.crear({
      prestamoId,
      tipo: TIPOS_CHECKLIST.RECEPCION,
      items: Object.fromEntries(componentesRecepcion.map((c) => [c.nombre, { estado: c.estado, observacion: c.observacion }])),
      observaciones: (checklistRecepcion && checklistRecepcion.observaciones) || null,
      tieneDano: danoEnChecklist ? 1 : 0,
      realizadoPorTipo: actor.tipo,
      realizadoPorId: actor.id || null,
    });

    for (const comp of componentesRecepcion) {
      await componenteEquipoModel.actualizarEstado({
        equipoId: equipo.id,
        nombre: comp.nombre,
        estado: comp.estado,
        observacion: comp.observacion || null,
        actualizadoPorId: actor.id || null,
      });
    }

    const prestamoActualizado = await prestamoModel.registrarDevolucion(prestamoId, { checklistRecepcionId: checklist.id });

    const nuevoEstadoEquipo = requiereReparacion ? ESTADOS_EQUIPO.EN_REPARACION : ESTADOS_EQUIPO.DISPONIBLE;
    const equipoActualizado = await equipoModel.actualizarEstado(equipo.id, nuevoEstadoEquipo);

    if (prestamo.retiro_id) {
      const quedanActivos = await prestamoModel.contarActivosDeRetiro(prestamo.retiro_id);
      await retiroModel.actualizarEstado(
        prestamo.retiro_id,
        quedanActivos > 0 ? ESTADOS_RETIRO.PARCIAL : ESTADOS_RETIRO.DEVUELTO
      );
    }

    await AuditoriaService.registrar({
      actorTipo: actor.tipo,
      actorId: actor.id || null,
      accion: ACCIONES_AUDITORIA.PRESTAMO_DEVUELTO,
      entidad: 'prestamo',
      entidadId: prestamoId,
      detalle: { danoEnChecklist, incidenciaAbierta, nuevoEstadoEquipo },
      ip,
    });
    if (requiereReparacion) {
      await AuditoriaService.registrar({
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

/** HU04 paso 1 - Solicitud de devolución realizada por el empleado. */
async function solicitarDevolucion({ empleado, prestamoId, ip }) {
  const prestamo = await prestamoModel.buscarPorId(prestamoId);
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

  const actualizado = await prestamoModel.marcarDevolucionSolicitada(prestamoId);
  await AuditoriaService.registrar({
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