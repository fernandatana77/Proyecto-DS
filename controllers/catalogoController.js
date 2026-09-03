'use strict';

const { validarIdEntero } = require('../utils/validacion');
const { errores } = require('../utils/errores');
const { resumirEstado, resumirDesdeConteos } = require('../utils/estadoEquipo');
const equipoModel = require('../models/equipoModel');
const componenteEquipoModel = require('../models/componenteEquipoModel');
const softwareInstaladoModel = require('../models/softwareInstaladoModel');
const DepreciacionService = require('../services/DepreciacionService');

function presentarComponente(fila) {
  return {
    nombre: fila.nombre,
    estado: fila.estado, // 'bueno' | 'regular' | 'malo'
    observacion: fila.observacion || '',
    actualizadoEn: fila.actualizado_en,
  };
}

/** Da forma a una fila del catalogo para el cliente (HU02). */
function presentarEquipoLista(fila) {
  const asignacionActual = fila.prestamo_activo_id
    ? {
        prestamoId: fila.prestamo_activo_id,
        empleadoId: fila.asignado_empleado_id,
        empleadoNombre: fila.asignado_empleado_nombre,
        desde: fila.prestamo_activo_desde,
      }
    : null;

  return {
    id: fila.id,
    codigoInterno: fila.codigo_interno,
    nombre: fila.nombre,
    categoria: fila.categoria,
    marca: fila.marca,
    modelo: fila.modelo,
    estado: fila.estado,
    sede: fila.sede,
    ubicacion: fila.ubicacion,
    disponibleParaPrestamo: fila.estado === 'Disponible',
    resumenEstado: resumirDesdeConteos({ malos: fila.comp_malos, regulares: fila.comp_regulares }),
    asignacionActual,
  };
}

/**
 * GET /api/catalogo?estado=&sede=&categoria=
 * HU02 - Lista equipos agrupables por categoria, con estado de asignacion y un
 * resumen del estado fisico (sin necesidad de abrir el detalle).
 */
async function listar(req, res, next) {
  try {
    const filtros = {
      estado: req.query.estado || undefined,
      sede: req.query.sede || undefined,
      categoria: req.query.categoria || undefined,
    };
    const filas = equipoModel.listarCatalogo(filtros);
    const equipos = filas.map((fila) => {
      const base = presentarEquipoLista(fila);
      base.componentes = componenteEquipoModel.listarPorEquipo(fila.id).map(presentarComponente);
      return base;
    });

    const categorias = [...new Set(equipos.map((e) => e.categoria))].sort();
    res.status(200).json({ total: equipos.length, categorias, equipos });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/catalogo/:id
 * HU02 - Detalle: estado, asignacion, checklist de componentes (solo lectura),
 * software y vida util.
 */
async function detalle(req, res, next) {
  try {
    const id = validarIdEntero(req.params.id, 'id');
    const equipo = equipoModel.buscarPorId(id);
    if (!equipo) throw errores.noEncontrado('El equipo no existe.', 'EQUIPO_NO_ENCONTRADO');

    const componentes = componenteEquipoModel.listarPorEquipo(id).map(presentarComponente);

    res.status(200).json({
      equipo: {
        id: equipo.id,
        codigoInterno: equipo.codigo_interno,
        nombre: equipo.nombre,
        categoria: equipo.categoria,
        marca: equipo.marca,
        modelo: equipo.modelo,
        numeroSerie: equipo.numero_serie,
        estado: equipo.estado,
        sede: equipo.sede,
        ubicacion: equipo.ubicacion,
        disponibleParaPrestamo: equipo.estado === 'Disponible',
      },
      resumenEstado: resumirEstado(componentes),
      componentes,
      software: softwareInstaladoModel.listarPorEquipo(id),
      vidaUtil: DepreciacionService.calcularVidaUtil(equipo),
    });
  } catch (error) {
    next(error);
  }
}

module.exports = { listar, detalle };
