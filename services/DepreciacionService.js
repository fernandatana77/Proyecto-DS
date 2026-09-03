'use strict';

/**
 * Calculo de vida util y valor residual de un equipo (alimenta HU05).
 * Metodo: depreciacion lineal sobre `vida_util_meses` desde `fecha_adquisicion`.
 */

function mesesTranscurridos(fechaAdquisicion, fechaReferencia = new Date()) {
  if (!fechaAdquisicion) return 0;
  const inicio = new Date(fechaAdquisicion);
  if (Number.isNaN(inicio.getTime())) return 0;
  const ms = fechaReferencia.getTime() - inicio.getTime();
  return Math.max(0, ms / (1000 * 60 * 60 * 24 * 30.4375));
}

/**
 * @returns {{
 *   vidaUtilMeses: number, mesesUso: number, mesesRestantes: number,
 *   porcentajeVidaConsumida: number, valorAdquisicion: number, valorResidual: number
 * }}
 */
function calcularVidaUtil(equipo, fechaReferencia = new Date()) {
  const vidaUtilMeses = Number(equipo.vida_util_meses) || 0;
  const valorAdquisicion = Number(equipo.valor_adquisicion) || 0;
  const mesesUso = Math.round(mesesTranscurridos(equipo.fecha_adquisicion, fechaReferencia));

  const consumido = vidaUtilMeses > 0 ? Math.min(1, mesesUso / vidaUtilMeses) : 1;
  const valorResidual = Math.round(valorAdquisicion * (1 - consumido) * 100) / 100;

  return {
    vidaUtilMeses,
    mesesUso,
    mesesRestantes: Math.max(0, vidaUtilMeses - mesesUso),
    porcentajeVidaConsumida: Math.round(consumido * 10000) / 100,
    valorAdquisicion,
    valorResidual,
  };
}

module.exports = { calcularVidaUtil, mesesTranscurridos };
