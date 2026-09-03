'use strict';

const { obtenerConexion } = require('../config/database');

/** Acceso a datos de la tabla `checklist_estado`. Solo SQL, sin logica de negocio. */

function buscarPorId(id) {
  const fila = obtenerConexion().prepare('SELECT * FROM checklist_estado WHERE id = ?').get(id);
  return fila ? hidratar(fila) : undefined;
}

function buscarPorPrestamo(prestamoId) {
  return obtenerConexion()
    .prepare('SELECT * FROM checklist_estado WHERE prestamo_id = ? ORDER BY id')
    .all(prestamoId)
    .map(hidratar);
}

/**
 * Crea un checklist. `items` es un objeto { pantalla: 'bueno', ... }; se guarda
 * serializado. `tieneDano` lo calcula el service segun las reglas (RN04).
 */
function crear({ prestamoId = null, tipo, items, observaciones = null, tieneDano = 0, realizadoPorTipo, realizadoPorId = null }) {
  const info = obtenerConexion()
    .prepare(
      `INSERT INTO checklist_estado
         (prestamo_id, tipo, items_json, observaciones, tiene_dano, realizado_por_tipo, realizado_por_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      prestamoId,
      tipo,
      JSON.stringify(items),
      observaciones,
      tieneDano ? 1 : 0,
      realizadoPorTipo,
      realizadoPorId
    );
  return buscarPorId(Number(info.lastInsertRowid));
}

/** Asocia un checklist creado antes que el prestamo (mismo flujo transaccional). */
function asignarPrestamo(id, prestamoId) {
  obtenerConexion()
    .prepare('UPDATE checklist_estado SET prestamo_id = ? WHERE id = ?')
    .run(prestamoId, id);
}

function hidratar(fila) {
  return { ...fila, items: JSON.parse(fila.items_json), tiene_dano: Boolean(fila.tiene_dano) };
}

module.exports = { buscarPorId, buscarPorPrestamo, crear, asignarPrestamo };
