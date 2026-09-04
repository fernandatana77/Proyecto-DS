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

const equipoModel = require('../models/equipoModel');
const DashboardService = require('../services/DashboardService');

let contador = 0;

function fechaHaceMeses(n) {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return d.toISOString().slice(0, 10);
}

function crearEquipo({ categoria, estado = 'Disponible', mesesDesdeAdquisicion = null, vidaUtilMeses = 48 }) {
  contador += 1;
  return equipoModel.crear({
    codigoInterno: `EQD-${contador}`,
    nombre: `Equipo ${contador}`,
    categoria,
    sede: 'Matriz',
    estado,
    vidaUtilMeses,
    fechaAdquisicion: mesesDesdeAdquisicion === null ? null : fechaHaceMeses(mesesDesdeAdquisicion),
  });
}

test.before(() => {
  obtenerConexion();
  ejecutarMigraciones();

  // Laptops
  crearEquipo({ categoria: 'Laptop', estado: 'Disponible', mesesDesdeAdquisicion: 24, vidaUtilMeses: 48 }); // ~50%
  crearEquipo({ categoria: 'Laptop', estado: 'En Reparación', mesesDesdeAdquisicion: 60, vidaUtilMeses: 48 }); // 100% (acotado)
  crearEquipo({ categoria: 'Laptop', estado: 'Prestado', mesesDesdeAdquisicion: 6, vidaUtilMeses: 48 }); // ~12.5%
  crearEquipo({ categoria: 'Laptop', estado: 'Disponible', mesesDesdeAdquisicion: null }); // sin fecha -> fuera del promedio
  crearEquipo({ categoria: 'Laptop', estado: 'Disponible', mesesDesdeAdquisicion: -12, vidaUtilMeses: 48 }); // fecha futura -> 0%
  // Mouse
  crearEquipo({ categoria: 'Mouse', estado: 'Disponible', mesesDesdeAdquisicion: 12, vidaUtilMeses: 36 }); // ~33%
  crearEquipo({ categoria: 'Mouse', estado: 'De Baja', mesesDesdeAdquisicion: 40, vidaUtilMeses: 36 }); // 100%
});
test.after(() => cerrarConexion());

test('HU05: totales del parque (todas las categorías)', () => {
  const { totales, categorias } = DashboardService.obtenerMetricas();
  assert.equal(totales.total, 7);
  assert.equal(totales.disponibles, 4);
  assert.equal(totales.prestados, 1);
  assert.equal(totales.enReparacion, 1);
  assert.equal(totales.deBaja, 1);
  assert.equal(totales.conVidaUtil, 6); // todos menos el que no tiene fecha
  assert.deepEqual(categorias, ['Laptop', 'Mouse']);
});

test('RN05: vida útil % se calcula por fecha de adquisición y se acota a [0, 100]', () => {
  const { porCategoria } = DashboardService.obtenerMetricas();
  const laptop = porCategoria.find((c) => c.categoria === 'Laptop');
  // promedio Laptop sobre 4 equipos con fecha: ~50, 100, ~12.5, 0
  assert.equal(laptop.conVidaUtil, 4);
  assert.ok(laptop.vidaUtilPct > 35 && laptop.vidaUtilPct < 46, `esperado ~40, fue ${laptop.vidaUtilPct}`);

  const cerca = DashboardService.obtenerMetricas({ categoria: 'Laptop' }).cercaFinVidaUtil;
  const acotadoArriba = cerca.find((e) => e.vidaUtilPct === 100);
  assert.ok(acotadoArriba, 'el equipo de 60 meses / vida 48 llega a 100% (acotado)');
});

test('RN05: fecha de adquisición futura => 0% (no negativo)', () => {
  const cerca = DashboardService.obtenerMetricas().cercaFinVidaUtil;
  assert.ok(cerca.every((e) => e.vidaUtilPct >= 0));
  // el de fecha futura no aparece en "cerca del fin de vida útil"
  const laptopFutura = equipoModel.equiposCercaFinVidaUtil({ umbral: 0, limite: 50 })
    .map((e) => e.vida_util_pct);
  assert.ok(Math.min(...laptopFutura) >= 0);
});

test('HU05: filtro por categoría recalcula los totales', () => {
  const soloMouse = DashboardService.obtenerMetricas({ categoria: 'Mouse' });
  assert.equal(soloMouse.filtro, 'Mouse');
  assert.equal(soloMouse.totales.total, 2);
  assert.equal(soloMouse.totales.deBaja, 1);
  assert.equal(soloMouse.totales.disponibles, 1);
  assert.equal(soloMouse.totales.conVidaUtil, 2);
  // promedio Mouse: ~33 y 100 -> ~66
  assert.ok(soloMouse.totales.vidaUtilPctPromedio > 60 && soloMouse.totales.vidaUtilPctPromedio < 72);

  const soloLaptop = DashboardService.obtenerMetricas({ categoria: 'Laptop' });
  assert.equal(soloLaptop.totales.total, 5);
});

test('HU05: "cerca del fin de vida útil" lista los >= 85%, ordenados y limitados', () => {
  const { cercaFinVidaUtil } = DashboardService.obtenerMetricas();
  assert.equal(cercaFinVidaUtil.length, 2); // el de 60m/48 y el de 40m/36
  assert.ok(cercaFinVidaUtil.every((e) => e.vidaUtilPct >= 85));
  // orden descendente
  for (let i = 1; i < cercaFinVidaUtil.length; i += 1) {
    assert.ok(cercaFinVidaUtil[i - 1].vidaUtilPct >= cercaFinVidaUtil[i].vidaUtilPct);
  }
  // con filtro de categoría, solo la de esa categoría
  assert.equal(DashboardService.obtenerMetricas({ categoria: 'Mouse' }).cercaFinVidaUtil.length, 1);
});

test('HU05: categoría inexistente en el filtro se ignora (se muestran todas)', () => {
  const r = DashboardService.obtenerMetricas({ categoria: 'Nave espacial' });
  assert.equal(r.filtro, null);
  assert.equal(r.totales.total, 7);
});

test('RNF01: el dashboard responde rápido incluso con muchos equipos', () => {
  for (let i = 0; i < 400; i += 1) {
    crearEquipo({
      categoria: i % 2 ? 'Cargador' : 'Teclado',
      estado: ['Disponible', 'Prestado', 'En Reparación'][i % 3],
      mesesDesdeAdquisicion: i % 50,
    });
  }
  const t0 = performance.now();
  const r = DashboardService.obtenerMetricas();
  const ms = performance.now() - t0;
  assert.equal(r.totales.total, 407);
  assert.ok(ms < 500, `el dashboard tardó ${ms.toFixed(1)} ms (límite de la prueba: 500 ms; RNF01: 2000 ms)`);
});
