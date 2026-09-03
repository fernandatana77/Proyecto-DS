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
const { ESTADOS_EQUIPO, COMPONENTES_POR_CATEGORIA } = require('../config/constantes');

const empleadoModel = require('../models/empleadoModel');
const usuarioSistemaModel = require('../models/usuarioSistemaModel');
const equipoModel = require('../models/equipoModel');
const componenteEquipoModel = require('../models/componenteEquipoModel');
const prestamoModel = require('../models/prestamoModel');
const retiroModel = require('../models/retiroModel');
const PrestamoService = require('../services/PrestamoService');
const AuditoriaService = require('../services/AuditoriaService');

let empleado;
let tecnico;
let contador = 0;

test.before(() => {
  obtenerConexion();
  ejecutarMigraciones();
  empleado = empleadoModel.crear({
    cedula: '0000000001', nombres: 'Test', apellidos: 'Empleado',
    correo: 't@e.ec', cargo: 'QA', sede: 'Matriz', pinHash: hashPin('654321'),
  });
  tecnico = usuarioSistemaModel.crear({
    usuario: 'tecnico-test', passwordHash: 'scrypt$x$y', rol: 'Técnico',
  });
});

/** Actor staff valido para las devoluciones. */
function actorTecnico() {
  return { tipo: 'Técnico', id: tecnico.id };
}
test.after(() => cerrarConexion());

/** Crea un equipo con sus componentes; `estados` sobreescribe los que no van en 'bueno'. */
function crearEquipo({ categoria = 'Laptop', estado = ESTADOS_EQUIPO.DISPONIBLE, estados = {} } = {}) {
  contador += 1;
  const equipo = equipoModel.crear({
    codigoInterno: `EQ-${contador}`, nombre: `Equipo ${contador}`, categoria, sede: 'Matriz', estado,
  });
  for (const nombre of COMPONENTES_POR_CATEGORIA[categoria]) {
    componenteEquipoModel.crear({ equipoId: equipo.id, nombre, estado: estados[nombre] || 'bueno' });
  }
  return equipo;
}

function checklistCategoria(categoria, estados = {}) {
  const items = {};
  for (const nombre of COMPONENTES_POR_CATEGORIA[categoria]) items[nombre] = estados[nombre] || 'bueno';
  return { items, observaciones: 'Revision de prueba' };
}

test('HU01: retiro de varios equipos con PIN => prestamos formalizados y equipos Prestado', () => {
  const laptop = crearEquipo({ categoria: 'Laptop' });
  const mouse = crearEquipo({ categoria: 'Mouse' });

  const { retiro, prestamos, equipos } = PrestamoService.registrarRetiroConPin({
    empleado,
    equipoIds: [laptop.id, mouse.id],
    pinReingresado: '654321',
    ip: '10.0.0.1',
  });

  assert.equal(prestamos.length, 2);
  assert.equal(Boolean(retiro.aceptado_con_pin), true);
  assert.ok(equipos.every((e) => e.estado === ESTADOS_EQUIPO.PRESTADO));
  prestamos.forEach((p) => {
    assert.equal(p.retiro_id, retiro.id);
    assert.ok(p.checklist_salida_id, 'cada prestamo tiene checklist de salida');
  });

  const logs = AuditoriaService.consultar({ accion: 'RETIRO_REGISTRADO' });
  assert.ok(logs.some((l) => l.entidad_id === retiro.id));
});

test('RN02: PIN de aceptacion incorrecto => no se formaliza ningun prestamo del retiro', () => {
  const a = crearEquipo();
  const b = crearEquipo({ categoria: 'Cargador' });
  assert.throws(
    () => PrestamoService.registrarRetiroConPin({ empleado, equipoIds: [a.id, b.id], pinReingresado: '000000' }),
    (e) => e.codigo === 'PIN_ACEPTACION_INVALIDO'
  );
  assert.equal(equipoModel.buscarPorId(a.id).estado, ESTADOS_EQUIPO.DISPONIBLE);
  assert.equal(equipoModel.buscarPorId(b.id).estado, ESTADOS_EQUIPO.DISPONIBLE);
});

test('RN01: si un equipo del carrito no esta Disponible, se rechaza TODO el retiro', () => {
  const ok = crearEquipo();
  const enReparacion = crearEquipo({ estado: 'En Reparación' });
  assert.throws(
    () => PrestamoService.registrarRetiroConPin({ empleado, equipoIds: [ok.id, enReparacion.id], pinReingresado: '654321' }),
    (e) => e.codigo === 'EQUIPO_NO_DISPONIBLE'
  );
  assert.equal(equipoModel.buscarPorId(ok.id).estado, ESTADOS_EQUIPO.DISPONIBLE, 'no se presto el equipo valido');
});

test('El empleado NUNCA fija el estado fisico: el checklist de salida es la foto de componente_equipo', () => {
  const laptop = crearEquipo({ categoria: 'Laptop', estados: { bateria: 'regular', pantalla: 'malo' } });
  const { prestamos } = PrestamoService.registrarRetiroConPin({
    empleado, equipoIds: [laptop.id], pinReingresado: '654321',
  });
  const checklist = require('../models/checklistEstadoModel').buscarPorId(prestamos[0].checklist_salida_id);
  assert.equal(checklist.items.bateria.estado, 'regular');
  assert.equal(checklist.items.pantalla.estado, 'malo');
  assert.equal(checklist.tiene_dano, true);
  assert.equal(checklist.realizado_por_tipo, 'Sistema');
});

test('RN04: devolucion con dano en el checklist de recepcion => equipo a "En Reparación" y retiro Devuelto', () => {
  const laptop = crearEquipo({ categoria: 'Laptop' });
  const { retiro, prestamos } = PrestamoService.registrarRetiroConPin({
    empleado, equipoIds: [laptop.id], pinReingresado: '654321',
  });

  const res = PrestamoService.registrarDevolucion({
    prestamoId: prestamos[0].id,
    checklistRecepcion: checklistCategoria('Laptop', { teclado: 'malo' }),
    actor: actorTecnico(),
  });

  assert.equal(res.requiereReparacion, true);
  assert.equal(res.equipo.estado, ESTADOS_EQUIPO.EN_REPARACION);
  assert.equal(retiroModel.buscarPorId(retiro.id).estado, 'Devuelto');
  // TIC actualiza el estado fisico registrado del equipo:
  const comp = componenteEquipoModel.buscar(laptop.id, 'teclado');
  assert.equal(comp.estado, 'malo');
});

test('RN04: devolucion sin dano => equipo vuelve a Disponible', () => {
  const mouse = crearEquipo({ categoria: 'Mouse' });
  const { prestamos } = PrestamoService.registrarRetiroConPin({
    empleado, equipoIds: [mouse.id], pinReingresado: '654321',
  });
  const res = PrestamoService.registrarDevolucion({
    prestamoId: prestamos[0].id,
    checklistRecepcion: checklistCategoria('Mouse'),
    actor: actorTecnico(),
  });
  assert.equal(res.equipo.estado, ESTADOS_EQUIPO.DISPONIBLE);
});

test('Retiro parcial: al devolver 1 de 2 equipos, el retiro queda "Parcial"', () => {
  const a = crearEquipo({ categoria: 'Teclado' });
  const b = crearEquipo({ categoria: 'Monitor' });
  const { retiro, prestamos } = PrestamoService.registrarRetiroConPin({
    empleado, equipoIds: [a.id, b.id], pinReingresado: '654321',
  });
  PrestamoService.registrarDevolucion({
    prestamoId: prestamos[0].id,
    checklistRecepcion: checklistCategoria('Teclado'),
    actor: actorTecnico(),
  });
  assert.equal(retiroModel.buscarPorId(retiro.id).estado, 'Parcial');
});

test('HU04 paso 1: el empleado solicita la devolucion => se marca el prestamo (no lo cierra)', () => {
  const laptop = crearEquipo({ categoria: 'Laptop' });
  const { prestamos } = PrestamoService.registrarRetiroConPin({
    empleado, equipoIds: [laptop.id], pinReingresado: '654321',
  });
  const id = prestamos[0].id;

  const r1 = PrestamoService.solicitarDevolucion({ empleado, prestamoId: id });
  assert.equal(r1.yaSolicitada, false);
  assert.equal(prestamoModel.buscarPorId(id).devolucion_solicitada, 1);
  assert.equal(prestamoModel.buscarPorId(id).estado, 'Activo', 'sigue activo hasta que TIC certifica');

  // idempotente
  assert.equal(PrestamoService.solicitarDevolucion({ empleado, prestamoId: id }).yaSolicitada, true);

  assert.ok(AuditoriaService.consultar({ accion: 'DEVOLUCION_SOLICITADA' }).some((l) => l.entidad_id === id));
});

test('HU04 paso 1: un empleado no puede solicitar la devolucion de un prestamo ajeno', () => {
  const otro = empleadoModel.crear({
    cedula: '0000000099', nombres: 'Otro', apellidos: 'Empleado',
    correo: 'o@e.ec', cargo: 'QA', sede: 'Matriz', pinHash: hashPin('111111'),
  });
  const laptop = crearEquipo({ categoria: 'Laptop' });
  const { prestamos } = PrestamoService.registrarRetiroConPin({
    empleado, equipoIds: [laptop.id], pinReingresado: '654321',
  });
  assert.throws(
    () => PrestamoService.solicitarDevolucion({ empleado: otro, prestamoId: prestamos[0].id }),
    (e) => e.codigo === 'PRESTAMO_AJENO'
  );
});

test('HU04: la cola de pendientes de TIC pone las devoluciones solicitadas primero', () => {
  const a = crearEquipo({ categoria: 'Mouse' });
  const b = crearEquipo({ categoria: 'Teclado' });
  const { prestamos } = PrestamoService.registrarRetiroConPin({
    empleado, equipoIds: [a.id, b.id], pinReingresado: '654321',
  });
  PrestamoService.solicitarDevolucion({ empleado, prestamoId: prestamos[1].id });

  const pendientes = prestamoModel.listarPendientesDevolucion();
  const idxSolicitada = pendientes.findIndex((p) => p.id === prestamos[1].id);
  const idxNoSolicitada = pendientes.findIndex((p) => p.id === prestamos[0].id);

  assert.ok(idxSolicitada < idxNoSolicitada, 'la solicitada va antes que su hermana sin solicitar');
  assert.ok(
    pendientes.slice(0, idxSolicitada + 1).every((p) => p.devolucion_solicitada === 1),
    'todo lo que va antes tambien esta solicitado'
  );
  assert.ok(pendientes.every((p) => p.equipo_codigo && p.empleado_nombre));
});

test('RF07 / RN03: la bitacora de auditoria no se puede actualizar ni borrar', () => {
  const db = obtenerConexion();
  AuditoriaService.registrar({ actorTipo: 'Sistema', accion: 'PRUEBA_INMUTABILIDAD' });
  assert.throws(() => db.exec("UPDATE log_auditoria SET accion = 'HACKEADO'"));
  assert.throws(() => db.exec('DELETE FROM log_auditoria'));
});

test('RNF05: 3 intentos fallidos de PIN activan el bloqueo', () => {
  const { registrarIntentoFallido, reiniciar, _limpiarTodo } = require('../middlewares/rateLimitPIN');
  _limpiarTodo();
  const req = { ip: '203.0.113.9' };
  assert.equal(registrarIntentoFallido(req).bloqueado, false);
  assert.equal(registrarIntentoFallido(req).bloqueado, false);
  assert.equal(registrarIntentoFallido(req).bloqueado, true);
  reiniciar(req);
  assert.equal(registrarIntentoFallido(req).bloqueado, false);
});

test('Validacion: retiro sin equipos y con ids duplicados', () => {
  const { validarListaIdsEquipo } = require('../utils/validacion');
  assert.throws(() => validarListaIdsEquipo([]), (e) => e.codigo === 'RETIRO_SIN_EQUIPOS');
  assert.throws(() => validarListaIdsEquipo([3, 3]), (e) => e.codigo === 'RETIRO_EQUIPOS_DUPLICADOS');
});
