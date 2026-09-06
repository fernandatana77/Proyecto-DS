'use strict';

const { query } = require('../config/database');

/** Acceso a datos asíncrono de la tabla `usuario_sistema` para PostgreSQL. */

async function buscarPorId(id) {
  const res = await query('SELECT * FROM usuario_sistema WHERE id = $1', [id]);
  return res.rows[0] || null;
}

async function buscarActivoPorUsuario(usuario) {
  const res = await query('SELECT * FROM usuario_sistema WHERE usuario = $1 AND activo = 1', [usuario]);
  return res.rows[0] || null;
}

async function crear({ empleadoId = null, usuario, passwordHash, rol, activo = 1 }) {
  const res = await query(
    `INSERT INTO usuario_sistema (empleado_id, usuario, password_hash, rol, activo)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [empleadoId, usuario, passwordHash, rol, activo ? 1 : 0]
  );
  return res.rows[0];
}

module.exports = { buscarPorId, buscarActivoPorUsuario, crear };