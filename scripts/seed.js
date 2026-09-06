'use strict';

/**
 * Datos demo para probar el catalogo, el carrito de retiro (HU01/HU02) y la
 * devolucion (HU04) de punta a punta. Uso: `npm run seed`.
 * Recrea empleados, staff y equipos con su estado fisico por componente.
 * NO toca `log_auditoria` (es inmutable, RN03).
 */

const { query } = require('../config/database');
const { ejecutarMigraciones } = require('../models/esquema');
const { COMPONENTES_POR_CATEGORIA } = require('../config/constantes');
const { hashPin, hashPassword } = require('../utils/hash');

const empleadoModel = require('../models/empleadoModel');
const usuarioSistemaModel = require('../models/usuarioSistemaModel');
const equipoModel = require('../models/equipoModel');
const componenteEquipoModel = require('../models/componenteEquipoModel');

const EMPLEADOS = [
  { cedula: '0102030405', nombres: 'Ana María', apellidos: 'Pérez Loja', correo: 'ana.perez@empresa.ec', cargo: 'Analista Contable', sede: 'Matriz Cuenca', pin: '123456' },
  { cedula: '0203040506', nombres: 'Carlos', apellidos: 'Ríos Vega', correo: 'carlos.rios@empresa.ec', cargo: 'Asesor Comercial', sede: 'Sucursal Quito', pin: '234567' },
  { cedula: '0304050607', nombres: 'Lucía', apellidos: 'Ordóñez Peña', correo: 'lucia.ordonez@empresa.ec', cargo: 'Coordinadora RRHH', sede: 'Sucursal Guayaquil', pin: '345678' },
];

const STAFF = [
  { usuario: 'admin', password: 'Admin123*', rol: 'Admin' },
  { usuario: 'tecnico', password: 'Tecnico123*', rol: 'Técnico' },
];

/**
 * `componentes` lista solo los componentes que NO estan en 'bueno'.
 * Valor: 'regular' | 'malo' | ['regular', 'observacion...'].
 */
const EQUIPOS = [
  // --- Laptops ---
  { codigo: 'LAP-0001', nombre: 'Laptop Dell Latitude 5440', categoria: 'Laptop', marca: 'Dell', modelo: 'Latitude 5440', serie: 'DL5440-0001', estado: 'Disponible', sede: 'Matriz Cuenca', ubicacion: 'Bodega TIC', adquisicion: '2024-02-15', valor: 1200, vidaUtil: 48, componentes: {} },
  { codigo: 'LAP-0002', nombre: 'Laptop HP ProBook 450 G10', categoria: 'Laptop', marca: 'HP', modelo: 'ProBook 450 G10', serie: 'HP450-0002', estado: 'Disponible', sede: 'Matriz Cuenca', ubicacion: 'Bodega TIC', adquisicion: '2023-11-01', valor: 1100, vidaUtil: 48, componentes: { bateria: ['regular', 'Autonomia aproximada de 2 horas'], carcasa: ['regular', 'Desgaste en el reposamunecas'] } },
  { codigo: 'LAP-0003', nombre: 'Laptop Lenovo ThinkPad E14', categoria: 'Laptop', marca: 'Lenovo', modelo: 'ThinkPad E14', serie: 'LN-E14-0003', estado: 'En Reparación', sede: 'Sucursal Guayaquil', ubicacion: 'Taller externo', adquisicion: '2023-03-10', valor: 950, vidaUtil: 48, componentes: { pantalla: ['malo', 'Lineas verticales en el lado izquierdo'], teclado: ['regular', 'Tecla Enter dura'] } },
  { codigo: 'LAP-0004', nombre: 'Laptop Asus ExpertBook B1', categoria: 'Laptop', marca: 'Asus', modelo: 'ExpertBook B1', serie: 'AS-B1-0004', estado: 'Disponible', sede: 'Sucursal Quito', ubicacion: 'Bodega TIC', adquisicion: '2024-06-01', valor: 1050, vidaUtil: 48, componentes: { puertos: ['regular', 'Puerto USB-C derecho flojo'] } },

  // --- Monitores ---
  { codigo: 'MON-0001', nombre: 'Monitor LG 24MK430H', categoria: 'Monitor', marca: 'LG', modelo: '24MK430H', serie: 'LG24-0001', estado: 'Disponible', sede: 'Matriz Cuenca', ubicacion: 'Bodega TIC', adquisicion: '2022-09-20', valor: 180, vidaUtil: 60, componentes: {} },
  { codigo: 'MON-0002', nombre: 'Monitor Samsung S24R350', categoria: 'Monitor', marca: 'Samsung', modelo: 'S24R350', serie: 'SS24-0002', estado: 'Disponible', sede: 'Sucursal Quito', ubicacion: 'Bodega TIC', adquisicion: '2022-04-11', valor: 200, vidaUtil: 60, componentes: { botones: ['regular', 'Boton de menu responde con dificultad'] } },

  // --- Mouses ---
  { codigo: 'MOU-0001', nombre: 'Mouse Logitech M170', categoria: 'Mouse', marca: 'Logitech', modelo: 'M170', serie: 'LGM170-0001', estado: 'Disponible', sede: 'Matriz Cuenca', ubicacion: 'Bodega TIC', adquisicion: '2024-01-10', valor: 15, vidaUtil: 36, componentes: {} },
  { codigo: 'MOU-0002', nombre: 'Mouse Genius NX-7000', categoria: 'Mouse', marca: 'Genius', modelo: 'NX-7000', serie: 'GNX7-0002', estado: 'Disponible', sede: 'Matriz Cuenca', ubicacion: 'Bodega TIC', adquisicion: '2023-05-22', valor: 12, vidaUtil: 36, componentes: { clic_izquierdo: ['regular', 'Doble clic ocasional'] } },
  { codigo: 'MOU-0003', nombre: 'Mouse HP X1000', categoria: 'Mouse', marca: 'HP', modelo: 'X1000', serie: 'HPX1-0003', estado: 'Disponible', sede: 'Sucursal Guayaquil', ubicacion: 'Bodega TIC', adquisicion: '2024-03-15', valor: 14, vidaUtil: 36, componentes: {} },

  // --- Teclados ---
  { codigo: 'TEC-0001', nombre: 'Teclado Logitech K120', categoria: 'Teclado', marca: 'Logitech', modelo: 'K120', serie: 'LGK120-0001', estado: 'Disponible', sede: 'Matriz Cuenca', ubicacion: 'Bodega TIC', adquisicion: '2023-08-01', valor: 18, vidaUtil: 36, componentes: {} },
  { codigo: 'TEC-0002', nombre: 'Teclado Genius KB-125', categoria: 'Teclado', marca: 'Genius', modelo: 'KB-125', serie: 'GKB125-0002', estado: 'Disponible', sede: 'Sucursal Quito', ubicacion: 'Bodega TIC', adquisicion: '2022-12-05', valor: 10, vidaUtil: 36, componentes: { teclas: ['regular', 'Tecla N (enie) dura'] } },

  // --- Cargadores ---
  { codigo: 'CAR-0001', nombre: 'Cargador Dell 65W USB-C', categoria: 'Cargador', marca: 'Dell', modelo: 'HA65NM190', serie: 'DLC65-0001', estado: 'Disponible', sede: 'Matriz Cuenca', ubicacion: 'Bodega TIC', adquisicion: '2024-02-15', valor: 45, vidaUtil: 48, componentes: {} },
  { codigo: 'CAR-0002', nombre: 'Cargador HP 45W USB-C', categoria: 'Cargador', marca: 'HP', modelo: 'TPN-CA02', serie: 'HPC45-0002', estado: 'Disponible', sede: 'Matriz Cuenca', ubicacion: 'Bodega TIC', adquisicion: '2023-11-01', valor: 35, vidaUtil: 48, componentes: { cable: ['regular', 'Forro agrietado cerca del conector'] } },
  { codigo: 'CAR-0003', nombre: 'Cargador Lenovo 65W', categoria: 'Cargador', marca: 'Lenovo', modelo: 'ADLX65YLC3D', serie: 'LNC65-0003', estado: 'En Reparación', sede: 'Sucursal Guayaquil', ubicacion: 'Taller interno', adquisicion: '2023-03-10', valor: 40, vidaUtil: 48, componentes: { conector: ['malo', 'No hace contacto, requiere reemplazo'] } },

  // --- Proyectores ---
  { codigo: 'PRO-0001', nombre: 'Proyector Epson PowerLite E20', categoria: 'Proyector', marca: 'Epson', modelo: 'PowerLite E20', serie: 'EP-E20-0001', estado: 'Disponible', sede: 'Sucursal Quito', ubicacion: 'Sala de reuniones', adquisicion: '2022-06-20', valor: 650, vidaUtil: 60, componentes: { lampara: ['regular', 'Aproximadamente 1200 horas de uso'] } },
  { codigo: 'PRO-0002', nombre: 'Proyector BenQ MS550', categoria: 'Proyector', marca: 'BenQ', modelo: 'MS550', serie: 'BQ-MS550-0002', estado: 'De Baja', sede: 'Matriz Cuenca', ubicacion: 'Bodega TIC', adquisicion: '2019-02-01', valor: 480, vidaUtil: 60, componentes: { lampara: ['malo', 'Lampara agotada'], ventilacion: ['malo', 'Ventilador no gira'] } },
];

const TABLAS_RECREABLES = [
  'checklist_estado', 'incidencia', 'mantenimiento', 'software_instalado',
  'prestamo', 'retiro', 'componente_equipo', 'usuario_sistema', 'equipo', 'empleado',
];

async function recrearEsquema() {
  for (const tabla of TABLAS_RECREABLES) {
    await query(`TRUNCATE TABLE ${tabla} CASCADE;`);
  }
  await ejecutarMigraciones();
}

async function crearEquipoConComponentes(def) {
  const equipo = await equipoModel.crear({
    codigoInterno: def.codigo,
    nombre: def.nombre,
    categoria: def.categoria,
    marca: def.marca,
    modelo: def.modelo,
    numeroSerie: def.serie,
    estado: def.estado,
    sede: def.sede,
    ubicacion: def.ubicacion,
    fechaAdquisicion: def.adquisicion,
    valorAdquisicion: def.valor,
    vidaUtilMeses: def.vidaUtil,
  });

  for (const nombre of COMPONENTES_POR_CATEGORIA[def.categoria]) {
    const override = def.componentes[nombre];
    const [estado, observacion] = Array.isArray(override)
      ? override
      : [override || 'bueno', null];
    await componenteEquipoModel.crear({ equipoId: equipo.id, nombre, estado, observacion });
  }
  return equipo;
}

/**
 * Carga los datos demo.
 * @param {{ recrear?: boolean }} opciones recrear = TRUNCATE + RE-CREATE de las tablas
 */
async function sembrarDatosDemo({ recrear = false } = {}) {
  await ejecutarMigraciones();
  if (recrear) {
    await recrearEsquema();
  }

  for (const emp of EMPLEADOS) {
    await empleadoModel.crear({ ...emp, pinHash: hashPin(emp.pin) });
  }
  for (const c of STAFF) {
    await usuarioSistemaModel.crear({ usuario: c.usuario, passwordHash: hashPassword(c.password), rol: c.rol });
  }
  for (const def of EQUIPOS) {
    await crearEquipoConComponentes(def);
  }

  return {
    empleados: EMPLEADOS.length,
    staff: STAFF.length,
    equipos: EQUIPOS.length,
  };
}

module.exports = { sembrarDatosDemo };

// Ejecucion directa: `npm run seed` -> recrea el esquema y carga todo.
if (require.main === module) {
  sembrarDatosDemo({ recrear: true })
    .then((resumen) => {
      console.log('Seed completado.');
      console.log('  Empleados (PIN):', EMPLEADOS.map((e) => `${e.nombres} ${e.apellidos} -> ${e.pin}`).join(' | '));
      console.log('  Staff:', STAFF.map((s) => `${s.usuario}/${s.password} (${s.rol})`).join(' | '));
      console.log(`  Equipos: ${resumen.equipos}`);
      process.exit(0);
    })
    .catch((err) => {
      console.error('Error durante el seed:', err);
      process.exit(1);
    });
}