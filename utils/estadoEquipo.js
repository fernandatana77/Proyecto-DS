'use strict';

const {
  COMPONENTES_POR_CATEGORIA,
  ESTADOS_COMPONENTE,
  ESTADO_COMPONENTE_CON_DANO,
} = require('../config/constantes');
const { errores } = require('./errores');

/** Componentes evaluables de una categoria de equipo. */
function componentesDeCategoria(categoria) {
  return COMPONENTES_POR_CATEGORIA[categoria] || [];
}

/** true si algun componente esta en 'malo' (RN04). Acepta filas o mapa. */
function tieneDano(componentes) {
  const lista = Array.isArray(componentes) ? componentes : Object.values(componentes || {});
  return lista.some((c) => (c && typeof c === 'object' ? c.estado : c) === ESTADO_COMPONENTE_CON_DANO);
}

/**
 * Resume el estado fisico para mostrarlo de un vistazo en el catalogo.
 * @returns {{ nivel: 'bueno'|'detalles'|'danos', etiqueta: string }}
 */
function resumirEstado(componentes) {
  const lista = Array.isArray(componentes) ? componentes : Object.values(componentes || {});
  const estados = lista.map((c) => (c && typeof c === 'object' ? c.estado : c));
  if (estados.some((e) => e === 'malo')) return { nivel: 'danos', etiqueta: 'Con daños' };
  if (estados.some((e) => e === 'regular')) return { nivel: 'detalles', etiqueta: 'Con detalles' };
  return { nivel: 'bueno', etiqueta: 'Buen estado' };
}

/** Igual que `resumirEstado` pero a partir de conteos ya agregados en SQL. */
function resumirDesdeConteos({ malos = 0, regulares = 0 } = {}) {
  if (malos > 0) return { nivel: 'danos', etiqueta: 'Con daños' };
  if (regulares > 0) return { nivel: 'detalles', etiqueta: 'Con detalles' };
  return { nivel: 'bueno', etiqueta: 'Buen estado' };
}

/**
 * Valida la entrada de estado de componentes (alta de equipo, edicion por TIC,
 * checklist de recepcion). Devuelve `[{ nombre, estado, observacion }]`.
 * @param {string} categoria
 * @param {object} entrada  `{ <componente>: 'bueno' | { estado, observacion } }`
 */
function normalizarEntradaComponentes(categoria, entrada) {
  const componentes = componentesDeCategoria(categoria);
  if (!componentes.length) {
    throw errores.solicitudInvalida(`Categoria de equipo desconocida: "${categoria}".`, 'CATEGORIA_INVALIDA');
  }
  const fuente = entrada && typeof entrada === 'object' ? entrada.items ?? entrada : {};

  return componentes.map((nombre) => {
    const valor = fuente[nombre];
    const estado = String((valor && typeof valor === 'object' ? valor.estado : valor) ?? '')
      .trim()
      .toLowerCase();
    if (!ESTADOS_COMPONENTE.includes(estado)) {
      throw errores.solicitudInvalida(
        `El componente "${nombre}" debe ser uno de: ${ESTADOS_COMPONENTE.join(', ')}.`,
        'COMPONENTE_ESTADO_INVALIDO'
      );
    }
    const observacion = String((valor && typeof valor === 'object' ? valor.observacion : '') ?? '')
      .trim()
      .slice(0, 300);
    return { nombre, estado, observacion };
  });
}

/** Convierte filas de `componente_equipo` en el mapa que se guarda en un checklist. */
function componentesAMapa(filas) {
  const mapa = {};
  for (const fila of filas) {
    mapa[fila.nombre] = { estado: fila.estado, observacion: fila.observacion || '' };
  }
  return mapa;
}

module.exports = {
  componentesDeCategoria,
  tieneDano,
  resumirEstado,
  resumirDesdeConteos,
  normalizarEntradaComponentes,
  componentesAMapa,
};
