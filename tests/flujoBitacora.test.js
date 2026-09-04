'use strict';

// La config se lee de process.env al importar: fijar ANTES de requerir modulos.
process.env.ENTORNO = 'test';
process.env.DB_RUTA = ':memory:';
process.env.JWT_SECRET = 'secreto-de-test';
process.env.PIN_PEPPER = 'pimienta-de-test';

const test = require('node:test');
const assert = require('node:assert/strict');

const { obtenerConexion, cerrarConexion } = require('../config/database');
const { ejecutarMigraciones } = require('../models/esquema');
const { hashPin } = require('../utils/hash');

const empleadoModel = require('../models/empleadoModel');
const usuarioSistemaModel = require('../models/usuarioSistemaModel');
const AuditoriaService = require('../services/AuditoriaService');

let empleado;
let admin;
let tecnico;

test.before(() => {
  obtenerConexion();
  ejecutarMigraciones();

  empleado = empleadoModel.crear({
    cedula: '0000000001', nombres: 'Ana', apellidos: 'Pérez',
    correo: 'a@e.ec', cargo: 'QA', sede: 'Matriz', pinHash: hashPin('654321'),
  });
  admin = usuarioSistemaModel.crear({ usuario: 'admin-test', passwordHash: 'scrypt$x$y', rol: 'Admin' });
  tecnico = usuarioSistemaModel.crear({ usuario: 'tec-test', passwordHash: 'scrypt$x$y', rol: 'Técnico' });

  // Eventos variados para probar filtros.
  AuditoriaService.registrar({ actorTipo: 'Admin', actorId: admin.id, accion: 'LOGIN_STAFF_EXITOSO', entidad: 'usuario_sistema', entidadId: admin.id, ip: '10.0.0.1' });
  AuditoriaService.registrar({ actorTipo: 'Empleado', actorId: empleado.id, accion: 'LOGIN_PIN_EXITOSO', entidad: 'empleado', entidadId: empleado.id, ip: '10.0.0.2' });
  AuditoriaService.registrar({ actorTipo: 'Empleado', actorId: empleado.id, accion: 'RETIRO_REGISTRADO', entidad: 'retiro', entidadId: 1, detalle: { equipoIds: [1, 2] } });
  AuditoriaService.registrar({ actorTipo: 'Técnico', actorId: tecnico.id, accion: 'PRESTAMO_DEVUELTO', entidad: 'prestamo', entidadId: 1 });
  AuditoriaService.registrar({ actorTipo: 'Sistema', accion: 'EQUIPO_A_REPARACION', entidad: 'equipo', entidadId: 1, detalle: { motivo: 'Dano en checklist' } });
});
test.after(() => cerrarConexion());

test('HU06: la bitacora resuelve el nombre del actor y viene más reciente primero', () => {
  const { logs, total } = AuditoriaService.consultarBitacora({ porPagina: 100 });
  assert.equal(total, 5);
  assert.equal(logs.length, 5);
  // orden id DESC => el último insertado va primero
  assert.equal(logs[0].accion, 'EQUIPO_A_REPARACION');
  assert.equal(logs[0].actor_label, 'Sistema');

  const login = logs.find((l) => l.accion === 'LOGIN_STAFF_EXITOSO');
  assert.equal(login.actor_label, 'admin-test');
  const retiro = logs.find((l) => l.accion === 'RETIRO_REGISTRADO');
  assert.equal(retiro.actor_label, 'Ana Pérez');
  assert.deepEqual(retiro.detalle, { equipoIds: [1, 2] }); // detalle_json ya parseado
});

test('HU06: filtro por usuario (nombre / usuario, parcial e insensible a mayúsculas)', () => {
  const soloAna = AuditoriaService.consultarBitacora({ usuario: 'ana', porPagina: 100 });
  assert.ok(soloAna.total >= 2);
  assert.ok(soloAna.logs.every((l) => l.actor_label === 'Ana Pérez'));

  const soloAdmin = AuditoriaService.consultarBitacora({ usuario: 'admin-test', porPagina: 100 });
  assert.equal(soloAdmin.total, 1);
  assert.equal(soloAdmin.logs[0].actor_label, 'admin-test');
});

test('HU06: filtro por tipo de actor y por acción', () => {
  const sistema = AuditoriaService.consultarBitacora({ actorTipo: 'Sistema', porPagina: 100 });
  assert.equal(sistema.total, 1);
  assert.equal(sistema.logs[0].actor_tipo, 'Sistema');

  const porAccion = AuditoriaService.consultarBitacora({ accion: 'LOGIN_PIN_EXITOSO', porPagina: 100 });
  assert.equal(porAccion.total, 1);
  assert.equal(porAccion.logs[0].accion, 'LOGIN_PIN_EXITOSO');
});

test('HU06: filtro por rango de fechas', () => {
  const futuro = AuditoriaService.consultarBitacora({ desde: '2999-01-01', porPagina: 100 });
  assert.equal(futuro.total, 0);

  const pasado = AuditoriaService.consultarBitacora({ hasta: '2000-01-01', porPagina: 100 });
  assert.equal(pasado.total, 0);

  const todos = AuditoriaService.consultarBitacora({ desde: '2000-01-01', porPagina: 100 });
  assert.equal(todos.total, 5);

  // "hasta" con solo fecha incluye el día completo: la fecha del propio log debe entrar
  const uno = AuditoriaService.consultarBitacora({ porPagina: 1 }).logs[0];
  const mismoDia = AuditoriaService.consultarBitacora({ hasta: uno.fecha.slice(0, 10), porPagina: 100 });
  assert.ok(mismoDia.logs.some((l) => l.id === uno.id));
});

test('HU06: paginación', () => {
  const p1 = AuditoriaService.consultarBitacora({ pagina: 1, porPagina: 2 });
  assert.equal(p1.logs.length, 2);
  assert.equal(p1.total, 5);
  assert.equal(p1.paginas, 3);

  const p2 = AuditoriaService.consultarBitacora({ pagina: 2, porPagina: 2 });
  assert.equal(p2.logs.length, 2);
  assert.notEqual(p1.logs[0].id, p2.logs[0].id);

  const p3 = AuditoriaService.consultarBitacora({ pagina: 3, porPagina: 2 });
  assert.equal(p3.logs.length, 1);
});

test('HU06: acciones registradas (para el filtro) vienen distintas y ordenadas', () => {
  const acciones = AuditoriaService.accionesRegistradas();
  assert.deepEqual([...acciones].sort(), acciones); // ya ordenadas
  assert.equal(new Set(acciones).size, acciones.length); // sin duplicados
  assert.ok(acciones.includes('RETIRO_REGISTRADO'));
});

test('RN03: la bitacora sigue siendo inmutable (ni el service ni la BD permiten cambiarla)', () => {
  assert.equal(typeof AuditoriaService.actualizar, 'undefined');
  assert.equal(typeof AuditoriaService.eliminar, 'undefined');
  const db = obtenerConexion();
  assert.throws(() => db.exec("UPDATE log_auditoria SET accion = 'X'"));
  assert.throws(() => db.exec('DELETE FROM log_auditoria'));
});
