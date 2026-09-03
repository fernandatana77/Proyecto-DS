'use strict';

const { validarIdEntero } = require('../utils/validacion');
const { errores } = require('../utils/errores');
const IncidenciaService = require('../services/IncidenciaService');

function presentarIncidencia(fila) {
  return {
    id: fila.id,
    prestamoId: fila.prestamo_id,
    equipoId: fila.equipo_id,
    equipoCodigo: fila.equipo_codigo,
    equipoNombre: fila.equipo_nombre,
    categoria: fila.equipo_categoria,
    descripcion: fila.descripcion,
    severidad: fila.severidad,
    estado: fila.estado,
    notasTic: fila.notas_tic || '',
    reportadoPorNombre: fila.reportado_por_nombre || null,
    reportadoPorSede: fila.reportado_por_sede || null,
    fechaReporte: fila.fecha_reporte,
    fechaActualizacion: fila.fecha_actualizacion,
    fechaCierre: fila.fecha_cierre,
  };
}

/**
 * POST /api/incidencias   (auth: token PIN de empleado)
 * HU03 - El empleado reporta un problema en texto libre sobre un préstamo suyo.
 * Body: { prestamoId, descripcion }
 */
async function reportar(req, res, next) {
  try {
    const prestamoId = validarIdEntero(req.body?.prestamoId, 'prestamoId');
    const incidencia = IncidenciaService.reportarIncidencia({
      empleado: req.empleado,
      prestamoId,
      descripcion: req.body?.descripcion,
      ip: req.ip,
    });
    res.status(201).json({
      mensaje:
        'Incidencia reportada. El área de TIC la revisará y clasificará. ' +
        'El equipo sigue asignado a ti hasta la devolución.',
      incidencia: {
        id: incidencia.id,
        estado: incidencia.estado,
        severidad: incidencia.severidad,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/incidencias/mias   (auth: token PIN de empleado)
 * HU03 - Incidencias que reportó el empleado, con su estado y clasificación.
 */
async function listarMias(req, res, next) {
  try {
    const incidencias = IncidenciaService.listarDelEmpleado(req.empleado.id).map(presentarIncidencia);
    res.status(200).json({ total: incidencias.length, incidencias });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/incidencias?estado=&severidad=&prestamoId=   (auth: staff Admin/Tecnico)
 * HU03 - Cola de incidencias para TIC. 'sin clasificar' primero.
 */
async function listar(req, res, next) {
  try {
    const incidencias = IncidenciaService.listarParaTIC({
      estado: req.query.estado || undefined,
      severidad: req.query.severidad || undefined,
      prestamoId: req.query.prestamoId ? validarIdEntero(req.query.prestamoId, 'prestamoId') : undefined,
    }).map(presentarIncidencia);
    res.status(200).json({ total: incidencias.length, incidencias });
  } catch (error) {
    next(error);
  }
}

/**
 * PATCH /api/incidencias/:id   (auth: staff Admin/Tecnico)
 * HU03 - Triage: TIC clasifica la severidad, mueve el estado y agrega notas.
 * Body: { severidad?, estado?, notasTic? } — al menos uno.
 */
async function triar(req, res, next) {
  try {
    const id = validarIdEntero(req.params.id, 'id');
    const { severidad, estado, notasTic } = req.body || {};
    if (severidad === undefined && estado === undefined && notasTic === undefined) {
      throw errores.solicitudInvalida('Indique al menos severidad, estado o notas.', 'TRIAGE_VACIO');
    }

    const incidencia = IncidenciaService.triarIncidencia({
      incidenciaId: id,
      actor: req.actor,
      severidad,
      estado,
      notasTic,
      ip: req.ip,
    });
    res.status(200).json({
      mensaje: 'Incidencia actualizada.',
      incidencia: {
        id: incidencia.id,
        severidad: incidencia.severidad,
        estado: incidencia.estado,
        notasTic: incidencia.notas_tic || '',
      },
    });
  } catch (error) {
    next(error);
  }
}

module.exports = { reportar, listarMias, listar, triar };
