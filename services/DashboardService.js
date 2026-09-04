'use strict';

const equipoModel = require('../models/equipoModel');
const { CATEGORIAS_EQUIPO } = require('../config/constantes');

/**
 * HU05 / RF04 - Indicadores del parque de equipos para el Administrador.
 *
 * Todo sale de dos consultas agregadas sobre `equipo` (RNF01: sin bucles
 * pesados en cada carga). La "vida util %" se calcula en SQL segun la fecha de
 * adquisicion (RN05); nunca es un valor fijo almacenado.
 */

function redondear1(n) {
  return n == null ? null : Math.round(n * 10) / 10;
}

/** Normaliza una fila de `metricasPorCategoria` (los SUM vienen como number|bigint). */
function normalizarFila(fila) {
  return {
    categoria: fila.categoria,
    total: Number(fila.total),
    disponibles: Number(fila.disponibles),
    prestados: Number(fila.prestados),
    enReparacion: Number(fila.en_reparacion),
    enInstalacion: Number(fila.en_instalacion),
    deBaja: Number(fila.de_baja),
    conVidaUtil: Number(fila.con_vida_util),
    vidaUtilPct: redondear1(fila.vida_util_pct),
  };
}

/** Suma varias filas por categoria en un único bloque de totales. */
function agregar(filas) {
  const acc = {
    total: 0, disponibles: 0, prestados: 0, enReparacion: 0, enInstalacion: 0, deBaja: 0,
    conVidaUtil: 0,
  };
  let sumaPonderada = 0;
  for (const f of filas) {
    acc.total += f.total;
    acc.disponibles += f.disponibles;
    acc.prestados += f.prestados;
    acc.enReparacion += f.enReparacion;
    acc.enInstalacion += f.enInstalacion;
    acc.deBaja += f.deBaja;
    acc.conVidaUtil += f.conVidaUtil;
    if (f.vidaUtilPct != null) sumaPonderada += f.vidaUtilPct * f.conVidaUtil;
  }
  // promedio ponderado por cantidad de equipos con fecha de adquisicion
  acc.vidaUtilPctPromedio = acc.conVidaUtil > 0 ? redondear1(sumaPonderada / acc.conVidaUtil) : null;
  return acc;
}

/**
 * @param {{ categoria?: string }} filtros
 * @returns {{
 *   categorias: string[], filtro: string|null,
 *   totales: object, porCategoria: object[], cercaFinVidaUtil: object[]
 * }}
 */
function obtenerMetricas({ categoria } = {}) {
  const categoriaFiltrada = categoria && CATEGORIAS_EQUIPO.includes(categoria) ? categoria : null;

  const porCategoria = equipoModel.metricasPorCategoria().map(normalizarFila);
  const categorias = porCategoria.map((c) => c.categoria);

  const relevantes = categoriaFiltrada
    ? porCategoria.filter((c) => c.categoria === categoriaFiltrada)
    : porCategoria;

  const cercaFinVidaUtil = equipoModel
    .equiposCercaFinVidaUtil({ categoria: categoriaFiltrada, umbral: 85, limite: 5 })
    .map((e) => ({
      id: e.id,
      codigoInterno: e.codigo_interno,
      nombre: e.nombre,
      categoria: e.categoria,
      estado: e.estado,
      vidaUtilPct: redondear1(e.vida_util_pct),
    }));

  return {
    categorias,
    filtro: categoriaFiltrada,
    totales: agregar(relevantes),
    porCategoria,
    cercaFinVidaUtil,
  };
}

module.exports = { obtenerMetricas };
