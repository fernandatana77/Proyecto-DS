'use strict';

const { obtenerConexion } = require('../config/database');

/** Acceso a datos de la tabla `usuario_sistema` (staff: Admin / Tecnico). */

function buscarPorId(id) {
  return obtenerConexion().prepare('SELECT * FROM usuario_sistema WHERE id = ?').get(id);
}

function buscarActivoPorUsuario(usuario) {
  return obtenerConexion()
    .prepare('SELECT * FROM usuario_sistema WHERE usuario = ? AND activo = 1')
    .get(usuario);
}

function crear({ empleadoId = null, usuario, passwordHash, rol, activo = 1 }) {
  const info = obtenerConexion()
    .prepare(
      `INSERT INTO usuario_sistema (empleado_id, usuario, password_hash, rol, activo)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(empleadoId, usuario, passwordHash, rol, activo ? 1 : 0);
  return buscarPorId(Number(info.lastInsertRowid));
}

module.exports = { buscarPorId, buscarActivoPorUsuario, crear };
