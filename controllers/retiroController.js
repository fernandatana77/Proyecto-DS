'use strict';

const { validarListaIdsEquipo, validarPin } = require('../utils/validacion');
const PrestamoService = require('../services/PrestamoService');
const retiroModel = require('../models/retiroModel');

/**
 * POST /api/retiros   (auth: token PIN de empleado)
 * HU01 - Formaliza el carrito de retiro: uno o varios equipos, checklist de
 * salida (foto del estado que mantiene TIC) + reingreso del PIN (RN02).
 * Body: { equipoIds: number[], pin, observaciones? }
 */
async function registrar(req, res, next) {
  try {
    const equipoIds = validarListaIdsEquipo(req.body?.equipoIds);
    const pinReingresado = validarPin(req.body?.pin);
    const observaciones = String(req.body?.observaciones ?? '').trim().slice(0, 500) || null;

    const { retiro, prestamos, equipos } = PrestamoService.registrarRetiroConPin({
      empleado: req.empleado,
      equipoIds,
      pinReingresado,
      observaciones,
      ip: req.ip,
    });

    res.status(201).json({
      mensaje:
        prestamos.length === 1
          ? 'Retiro formalizado: 1 equipo registrado.'
          : `Retiro formalizado: ${prestamos.length} equipos registrados.`,
      retiro: {
        id: retiro.id,
        estado: retiro.estado,
        fechaRetiro: retiro.fecha_retiro,
        aceptadoConPin: Boolean(retiro.aceptado_con_pin),
      },
      equipos: equipos.map((e, i) => ({
        prestamoId: prestamos[i].id,
        equipoId: e.id,
        codigoInterno: e.codigo_interno,
        nombre: e.nombre,
        categoria: e.categoria,
        estado: e.estado,
      })),
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/retiros/mios   (auth: token PIN de empleado)
 * HU02 - Retiros del empleado autenticado con sus equipos.
 */
async function listarMios(req, res, next) {
  try {
    const retiros = retiroModel.listarPorEmpleadoConEquipos(req.empleado.id).map((r) => ({
      id: r.id,
      estado: r.estado,
      fechaRetiro: r.fecha_retiro,
      equipos: r.equipos.map((e) => ({
        prestamoId: e.prestamo_id,
        codigoInterno: e.codigo_interno,
        nombre: e.nombre,
        categoria: e.categoria,
        estadoPrestamo: e.prestamo_estado,
        fechaDevolucion: e.fecha_devolucion_real,
      })),
    }));
    res.status(200).json({ total: retiros.length, retiros });
  } catch (error) {
    next(error);
  }
}

module.exports = { registrar, listarMios };
