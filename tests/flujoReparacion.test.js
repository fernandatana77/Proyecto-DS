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
const mantenimientoModel = require('../models/mantenimientoModel');
const EquipoService = require('../services/EquipoService');
const AuditoriaService = require('../services/AuditoriaService');

let empleado;
let tecnico;
let contador = 0;

test.before(() => {
  obtenerConexion();
  ejecutarMigraciones();
  empleado = empleadoModel.crear({
    cedula: '0000000001', nombres: 'Ana', apellidos: 'Prueba',
    correo: 'a@e.ec', cargo: 'QA', sede: 'Matriz', pinHash: hashPin('654321'),
  });
  tecnico = usuarioSistemaModel.crear({ usuario: 'tec-test', passwordHash: 'scrypt$x$y', rol: 'Técnico' });
});
test.after(() => cerrarConexion());

const actor = () => ({ tipo: 'Técnico', id: tecnico.id });
const LAPTOP = COMPONENTES_POR_CATEGORIA.Laptop;
const todoBueno = () => Object.fromEntries(LAPTOP.map((n) => [n, 'bueno']));

/** Crea una Laptop 'En Reparación' con `pantalla` en 'malo'. */
function equipoEnReparacion() {
  contador += 1;
  const eq = equipoModel.crear({
    codigoInterno: `REP-${contador}`, nombre: `Equipo ${contador}`, categoria: 'Laptop',
    sede: 'Matriz', estado: ESTADOS_EQUIPO.EN_REPARACION,
  });
  for (const n of LAPTOP) componenteEquipoModel.crear({ equipoId: eq.id, nombre: n, estado: n === 'pantalla' ? 'malo' : 'bueno' });
  return eq;
}

test('finalizar reparación => equipo Disponible, mantenimiento Finalizado y componente reparado', () => {
  const eq = equipoEnReparacion();

  const r = EquipoService.finalizarReparacion({
    equipoId: eq.id,
    resultado: ESTADOS_EQUIPO.DISPONIBLE,
    observaciones: 'Cambio de pantalla y prueba de video.',
    componentes: todoBueno(),
    actor: actor(),
  });

  assert.equal(r.equipo.estado, ESTADOS_EQUIPO.DISPONIBLE);
  assert.equal(equipoModel.buscarPorId(eq.id).estado, ESTADOS_EQUIPO.DISPONIBLE);
  assert.equal(componenteEquipoModel.buscar(eq.id, 'pantalla').estado, 'bueno');

  const mant = mantenimientoModel.listarPorEquipo(eq.id);
  assert.equal(mant.length, 1);
  assert.equal(mant[0].tipo, 'Correctivo');
  assert.equal(mant[0].estado, 'Finalizado');
  assert.ok(mant[0].fecha_fin);

  assert.ok(AuditoriaService.consultar({ accion: 'REPARACION_FINALIZADA' }).some((l) => l.entidad_id === eq.id));
});

test('no se puede finalizar la reparación de un equipo que no está "En Reparación"', () => {
  const eq = equipoModel.crear({ codigoInterno: 'REP-D', nombre: 'Disp', categoria: 'Laptop', sede: 'Matriz', estado: 'Disponible' });
  for (const n of LAPTOP) componenteEquipoModel.crear({ equipoId: eq.id, nombre: n, estado: 'bueno' });
  assert.throws(
    () => EquipoService.finalizarReparacion({ equipoId: eq.id, resultado: 'Disponible', observaciones: 'no aplica', actor: actor() }),
    (e) => e.codigo === 'EQUIPO_NO_EN_REPARACION'
  );
});

test('"Disponible" con un componente todavía en "malo" => se rechaza', () => {
  const eq = equipoEnReparacion();
  assert.throws(
    () =>
      EquipoService.finalizarReparacion({
        equipoId: eq.id,
        resultado: ESTADOS_EQUIPO.DISPONIBLE,
        observaciones: 'No se pudo arreglar del todo.',
        componentes: { ...todoBueno(), pantalla: 'malo' },
        actor: actor(),
      }),
    (e) => e.codigo === 'COMPONENTES_CON_DANO'
  );
  assert.equal(equipoModel.buscarPorId(eq.id).estado, ESTADOS_EQUIPO.EN_REPARACION);
});

test('"De Baja" sí se permite aunque queden componentes en "malo"', () => {
  const eq = equipoEnReparacion();
  const r = EquipoService.finalizarReparacion({
    equipoId: eq.id,
    resultado: ESTADOS_EQUIPO.DE_BAJA,
    observaciones: 'Placa base dañada, no vale la pena repararlo.',
    actor: actor(),
  });
  assert.equal(r.equipo.estado, ESTADOS_EQUIPO.DE_BAJA);
  assert.ok(AuditoriaService.consultar({ accion: 'EQUIPO_DADO_DE_BAJA' }).some((l) => l.entidad_id === eq.id));
});

test('observaciones muy cortas => se rechaza', () => {
  const eq = equipoEnReparacion();
  assert.throws(
    () => EquipoService.finalizarReparacion({ equipoId: eq.id, resultado: 'Disponible', observaciones: 'ok', componentes: todoBueno(), actor: actor() }),
    (e) => e.codigo === 'OBSERVACIONES_REQUERIDAS'
  );
});

test('resultado inválido => se rechaza', () => {
  const eq = equipoEnReparacion();
  assert.throws(
    () => EquipoService.finalizarReparacion({ equipoId: eq.id, resultado: 'En Instalación', observaciones: 'algo valido', actor: actor() }),
    (e) => e.codigo === 'RESULTADO_INVALIDO'
  );
});

test('cerrarIncidencias: cierra las incidencias abiertas del equipo (o no, si se desactiva)', () => {
  const eq = equipoEnReparacion();
  incidenciaModel.crear({
    prestamoId: null, equipoId: eq.id, reportadoPorTipo: 'Empleado', reportadoPorId: empleado.id,
    descripcion: 'La pantalla no enciende.',
  });

  // primero sin cerrar
  const eq2 = equipoEnReparacion();
  incidenciaModel.crear({ prestamoId: null, equipoId: eq2.id, reportadoPorTipo: 'Empleado', reportadoPorId: empleado.id, descripcion: 'Otro problema abierto.' });
  const sinCerrar = EquipoService.finalizarReparacion({
    equipoId: eq2.id, resultado: 'De Baja', observaciones: 'baja sin cerrar incidencias', cerrarIncidencias: false, actor: actor(),
  });
  assert.equal(sinCerrar.incidenciasCerradas, 0);
  assert.equal(incidenciaModel.contarAbiertasPorPrestamo(null) >= 0, true);
  assert.equal(incidenciaModel.listarPorEquipo(eq2.id)[0].estado, 'Abierta');

  // ahora cerrando
  const r = EquipoService.finalizarReparacion({
    equipoId: eq.id, resultado: ESTADOS_EQUIPO.DISPONIBLE, observaciones: 'Pantalla reemplazada.', componentes: todoBueno(), cerrarIncidencias: true, actor: actor(),
  });
  assert.equal(r.incidenciasCerradas, 1);
  assert.equal(incidenciaModel.listarPorEquipo(eq.id)[0].estado, 'Cerrada');
});
