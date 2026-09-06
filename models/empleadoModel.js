'use strict';

const { query } = require('../config/database');

/** Acceso a datos asíncrono de la tabla `empleado` para PostgreSQL. */

async function buscarPorId(id) {
  const res = await query('SELECT * FROM empleado WHERE id = $1', [id]);
  return res.rows[0] || null;
}

/** Login de empleado: búsqueda por el hash del PIN. */
async function buscarActivoPorHashPin(pinHash) {
  const res = await query(
    'SELECT * FROM empleado WHERE pin_hash = $1 AND activo = 1',
    [pinHash]
  );
  return res.rows[0] || null;
}

async function buscarPorCedula(cedula) {
  const res = await query('SELECT * FROM empleado WHERE cedula = $1', [cedula]);
  return res.rows[0] || null;
}

async function listar() {
  const res = await query('SELECT * FROM empleado ORDER BY apellidos, nombres');
  return res.rows;
}

async function crear({ cedula, nombres, apellidos, correo, cargo, sede, pinHash, activo = 1 }) {
  const res = await query(
    `INSERT INTO empleado (cedula, nombres, apellidos, correo, cargo, sede, pin_hash, activo)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (cedula) DO NOTHING
     RETURNING *`,
    [cedula, nombres, apellidos, correo ?? null, cargo ?? null, sede, pinHash, activo ? 1 : 0]
  );

  // Si ya existia por cedula y ON CONFLICT ignoro el INSERT, retornamos el empleado existente
  if (!res.rows[0]) {
    return await buscarPorCedula(cedula);
  }

  return res.rows[0];
}

module.exports = { buscarPorId, buscarActivoPorHashPin, buscarPorCedula, listar, crear };