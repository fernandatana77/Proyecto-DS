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
const incidenciaModel = require('../models/incidenciaModel');
const PrestamoService = require('../services/PrestamoService');
const IncidenciaService = require('../services/IncidenciaService');
const AuditoriaService = require('../services/AuditoriaService');

let empleado;
let otroEmpleado;
let tecnico;
let contador = 0;

test.before(() => {
  obtenerConexion();
  ejecutarMigraciones();
  empleado = empleadoModel.crear({
    cedula: '0000000001', nombres: 'Ana', apellidos: 'Prueba',
    correo: 'a@e.ec', cargo: 'QA', sede: 'Matriz', pinHash: hashPin('654321'),
  });
  otroEmpleado = empleadoModel.crear({
    cedula: '0000000002', nombres: 'Beto', apellidos: 'Prueba',
    correo: 'b@e.ec', cargo: 'QA', sede: 'Matriz', pinHash: hashPin('111111'),
  });
  tecnico = usuarioSistemaModel.crear({ usuario: 'tec-test', passwordHash: 'scrypt$x$y', rol: 'Técnico' });
});
test.after(() => cerrarConexion());

function actorTecnico() {
  return { tipo: 'Técnico', id: tecnico.id };
}

function crearEquipo({ categoria = 'Laptop', estado = ESTADOS_EQUIPO.DISPONIBLE } = {}) {
  contador += 1;
  const equipo = equipoModel.crear({
    codigoInterno: `EQI-${contador}`, nombre: `Equipo ${contador}`, categoria, sede: 'Matriz', estado,
  });
  for (const nombre of COMPONENTES_POR_CATEGORIA[categoria]) {
    componenteEquipoModel.crear({ equipoId: equipo.id, nombre, estado: 'bueno' });
  }
  return equipo;
}

function checklistBueno(categoria) {
  const items = {};
  for (const nombre of COMPONENTES_POR_CATEGORIA[categoria]) items[nombre] = 'bueno';
  return { items };
}

/** Deja al empleado con un prestamo activo y devuelve el prestamoId. */
function prestamoActivoDe(quien = empleado, pin = '654321') {
  const equipo = crearEquipo();
  const { prestamos } = PrestamoService.registrarRetiroConPin({
    empleado: quien, equipoIds: [equipo.id], pinReingresado: pin,
  });
  return { prestamoId: prestamos[0].id, equipoId: equipo.id, equipo };
}

test('HU03: el empleado reporta una incidencia en texto libre => nace "sin clasificar"/"Abierta" y NO cambia el equipo', () => {
  const { prestamoId, equipoId } = prestamoActivoDe();

  const incidencia = IncidenciaService.reportarIncidencia({
    empleado,
    prestamoId,
    descripcion: 'La pantalla parpadea cuando muevo la bisagra.',
    ip: '10.0.0.1',
  });

  assert.equal(incidencia.severidad, 'sin clasificar');
  assert.equal(incidencia.estado, 'Abierta');
  assert.equal(incidencia.reportado_por_tipo, 'Empleado');
  assert.equal(incidencia.reportado_por_id, empleado.id);
  assert.equal(incidencia.prestamo_id, prestamoId);
  // el equipo sigue Prestado: reportar NO cambia su estado
  assert.equal(equipoModel.buscarPorId(equipoId).estado, ESTADOS_EQUIPO.PRESTADO);

  const logs = AuditoriaService.consultar({ accion: 'INCIDENCIA_REPORTADA' });
  assert.ok(logs.some((l) => l.entidad_id === incidencia.id));
});

test('HU03: descripcion demasiado corta => rechazada', () => {
  const { prestamoId } = prestamoActivoDe();
  assert.throws(
    () => IncidenciaService.reportarIncidencia({ empleado, prestamoId, descripcion: ' up' }),
    (e) => e.codigo === 'DESCRIPCION_INCIDENCIA_INVALIDA'
  );
});

test('HU03: un empleado no puede reportar sobre el prestamo de otro', () => {
  const { prestamoId } = prestamoActivoDe(otroEmpleado, '111111');
  assert.throws(
    () => IncidenciaService.reportarIncidencia({ empleado, prestamoId, descripcion: 'No es mi equipo pero reporto.' }),
    (e) => e.codigo === 'PRESTAMO_AJENO'
  );
});

test('HU03: no se puede reportar sobre un prestamo ya devuelto', () => {
  const { prestamoId } = prestamoActivoDe();
  PrestamoService.registrarDevolucion({
    prestamoId, checklistRecepcion: checklistBueno('Laptop'), actor: actorTecnico(),
  });
  assert.throws(
    () => IncidenciaService.reportarIncidencia({ empleado, prestamoId, descripcion: 'Tarde para reportar.' }),
    (e) => e.codigo === 'PRESTAMO_YA_DEVUELTO'
  );
});

test('RN04: una incidencia ABIERTA fuerza "En Reparación" aunque el checklist de recepcion no tenga daño', () => {
  const { prestamoId, equipoId } = prestamoActivoDe();
  IncidenciaService.reportarIncidencia({ empleado, prestamoId, descripcion: 'Se apaga sola cada tanto.' });

  const res = PrestamoService.registrarDevolucion({
    prestamoId, checklistRecepcion: checklistBueno('Laptop'), actor: actorTecnico(),
  });
  assert.equal(res.requiereReparacion, true);
  assert.equal(equipoModel.buscarPorId(equipoId).estado, ESTADOS_EQUIPO.EN_REPARACION);
});

test('HU03: TIC tría la incidencia: clasifica severidad y la cierra', () => {
  const { prestamoId, equipoId } = prestamoActivoDe();
  const inc = IncidenciaService.reportarIncidencia({ empleado, prestamoId, descripcion: 'Ruido raro en el ventilador.' });

  const clasif = IncidenciaService.triarIncidencia({
    incidenciaId: inc.id, actor: actorTecnico(), severidad: 'media', estado: 'En proceso', notasTic: 'Se agenda limpieza.',
  });
  assert.equal(clasif.severidad, 'media');
  assert.equal(clasif.estado, 'En proceso');
  assert.equal(clasif.atendida_por_id, tecnico.id);

  const cerrada = IncidenciaService.triarIncidencia({ incidenciaId: inc.id, actor: actorTecnico(), estado: 'Cerrada' });
  assert.equal(cerrada.estado, 'Cerrada');
  assert.ok(cerrada.fecha_cierre, 'se registra fecha de cierre');

  // Cerrada => ya no fuerza reparación en la devolución (si el checklist va bien)
  const res = PrestamoService.registrarDevolucion({
    prestamoId, checklistRecepcion: checklistBueno('Laptop'), actor: actorTecnico(),
  });
  assert.equal(res.requiereReparacion, false);
  assert.equal(equipoModel.buscarPorId(equipoId).estado, ESTADOS_EQUIPO.DISPONIBLE);

  assert.ok(AuditoriaService.consultar({ accion: 'INCIDENCIA_CERRADA' }).some((l) => l.entidad_id === inc.id));
});

test('HU03: TIC no puede asignar la severidad "sin clasificar" al triar', () => {
  const { prestamoId } = prestamoActivoDe();
  const inc = IncidenciaService.reportarIncidencia({ empleado, prestamoId, descripcion: 'Teclas pegajosas.' });
  assert.throws(
    () => IncidenciaService.triarIncidencia({ incidenciaId: inc.id, actor: actorTecnico(), severidad: 'sin clasificar' }),
    (e) => e.codigo === 'SEVERIDAD_INVALIDA'
  );
});

test('HU03: la cola de TIC pone "sin clasificar" primero', () => {
  const a = prestamoActivoDe();
  const b = prestamoActivoDe();
  const incA = IncidenciaService.reportarIncidencia({ empleado, prestamoId: a.prestamoId, descripcion: 'Problema A a revisar.' });
  const incB = IncidenciaService.reportarIncidencia({ empleado, prestamoId: b.prestamoId, descripcion: 'Problema B a revisar.' });
  // clasifico solo la B
  IncidenciaService.triarIncidencia({ incidenciaId: incB.id, actor: actorTecnico(), severidad: 'baja' });

  const cola = incidenciaModel.listarParaTIC({});
  const idxA = cola.findIndex((i) => i.id === incA.id);
  const idxB = cola.findIndex((i) => i.id === incB.id);
  assert.ok(idxA < idxB, 'la sin clasificar (A) va antes que la ya clasificada (B)');
});

test('HU03: el empleado solo ve las incidencias que él reportó', () => {
  const mia = prestamoActivoDe();
  const ajena = prestamoActivoDe(otroEmpleado, '111111');
  const incMia = IncidenciaService.reportarIncidencia({ empleado, prestamoId: mia.prestamoId, descripcion: 'Mi incidencia propia.' });
  IncidenciaService.reportarIncidencia({ empleado: otroEmpleado, prestamoId: ajena.prestamoId, descripcion: 'Incidencia de Beto.' });

  const mias = IncidenciaService.listarDelEmpleado(empleado.id);
  assert.ok(mias.some((i) => i.id === incMia.id));
  assert.ok(mias.every((i) => i.reportado_por_id === empleado.id));
});
