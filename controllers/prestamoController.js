'use strict';

const { validarIdEntero } = require('../utils/validacion');
const { errores } = require('../utils/errores');
const PrestamoService = require('../services/PrestamoService');
const prestamoModel = require('../models/prestamoModel');

function presentarPrestamoActivo(fila) {
  return {
    prestamoId: fila.id,
    retiroId: fila.retiro_id,
    equipoId: fila.equipo_id,
    equipoCodigo: fila.equipo_codigo,
    equipoNombre: fila.equipo_nombre,
    categoria: fila.equipo_categoria,
    fechaPrestamo: fila.fecha_prestamo,
    devolucionSolicitada: Boolean(fila.devolucion_solicitada),
    fechaSolicitud: fila.fecha_solicitud_devolucion,
    incidenciasAbiertas: fila.incidencias_abiertas ?? 0,
  };
}

/**
 * GET /api/prestamos/mios-activos   (auth: token PIN de empleado)
 * HU04 - Equipos que el empleado tiene prestados ahora mismo (para el banner).
 */
async function listarMiosActivos(req, res, next) {
  try {
    const prestamos = prestamoModel.listarActivosPorEmpleado(req.empleado.id).map(presentarPrestamoActivo);
    res.status(200).json({ total: prestamos.length, prestamos });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/prestamos/:id/solicitar-devolucion   (auth: token PIN de empleado)
 * HU04 paso 1 - El empleado avisa que va a devolver el equipo.
 */
async function solicitarDevolucion(req, res, next) {
  try {
    const prestamoId = validarIdEntero(req.params.id, 'id');
    const { yaSolicitada } = PrestamoService.solicitarDevolucion({
      empleado: req.empleado,
      prestamoId,
      ip: req.ip,
    });
    res.status(200).json({
      mensaje: yaSolicitada
        ? 'La devolucion de este equipo ya estaba solicitada. Entreguelo en el area de TIC.'
        : 'Devolucion solicitada. Lleve el equipo al area de TIC para que registren la recepcion.',
      prestamo: { id: prestamoId, devolucionSolicitada: true },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/prestamos/pendientes   (auth: staff Admin/Tecnico)
 * HU04 - Cola de devoluciones: las solicitadas por el empleado van primero.
 */
async function listarPendientes(_req, res, next) {
  try {
    const prestamos = prestamoModel.listarPendientesDevolucion().map((fila) => ({
      ...presentarPrestamoActivo(fila),
      empleadoNombre: fila.empleado_nombre,
      empleadoSede: fila.empleado_sede,
    }));
    res.status(200).json({ total: prestamos.length, prestamos });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/prestamos/:id/devolucion   (auth: staff Admin/Tecnico)
 * HU04 paso 2 - TIC certifica la recepcion con el checklist.
 * RN04 (dano o incidencia -> "En Reparación") lo aplica PrestamoService.
 * Body: { checklist: { items: { <componente>: 'bueno'|'regular'|'malo' | {estado, observacion} }, observaciones } }
 */
async function registrarDevolucion(req, res, next) {
  try {
    const prestamoId = validarIdEntero(req.params.id, 'id');
    const checklistRecepcion = req.body?.checklist;
    if (!checklistRecepcion || typeof checklistRecepcion !== 'object') {
      throw errores.solicitudInvalida(
        'Se requiere el checklist de recepcion para registrar la devolucion.',
        'CHECKLIST_RECEPCION_REQUERIDO'
      );
    }

    const resultado = PrestamoService.registrarDevolucion({
      prestamoId,
      checklistRecepcion,
      actor: req.actor,
      ip: req.ip,
    });

    res.status(200).json({
      mensaje: resultado.requiereReparacion
        ? 'Devolucion registrada. El equipo pasa a "En Reparación" (RN04).'
        : 'Devolucion registrada. El equipo vuelve a estar disponible.',
      prestamo: { id: resultado.prestamo.id, estado: resultado.prestamo.estado },
      equipo: { id: resultado.equipo.id, estado: resultado.equipo.estado },
      requiereReparacion: resultado.requiereReparacion,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = { listarMiosActivos, solicitarDevolucion, listarPendientes, registrarDevolucion };
