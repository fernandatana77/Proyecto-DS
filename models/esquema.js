'use strict';

const { obtenerConexion } = require('../config/database');

/**
 * Definicion completa del esquema (una tabla por entidad del DER) mas los
 * triggers que hacen inmutable `log_auditoria` (RF07 / RN03).
 * Se ejecuta al iniciar el servidor y en el seed. Es idempotente.
 */
const DDL = `
CREATE TABLE IF NOT EXISTS empleado (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  cedula            TEXT    NOT NULL UNIQUE,
  nombres           TEXT    NOT NULL,
  apellidos         TEXT    NOT NULL,
  correo            TEXT    UNIQUE,
  cargo             TEXT,
  sede              TEXT    NOT NULL,
  pin_hash          TEXT    NOT NULL UNIQUE,
  activo            INTEGER NOT NULL DEFAULT 1,
  creado_en         TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS usuario_sistema (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  empleado_id       INTEGER REFERENCES empleado(id),
  usuario           TEXT    NOT NULL UNIQUE,
  password_hash     TEXT    NOT NULL,
  rol               TEXT    NOT NULL CHECK (rol IN ('Admin','Técnico')),
  activo            INTEGER NOT NULL DEFAULT 1,
  creado_en         TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS equipo (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo_interno    TEXT    NOT NULL UNIQUE,
  nombre            TEXT    NOT NULL,
  categoria         TEXT    NOT NULL,
  marca             TEXT,
  modelo            TEXT,
  numero_serie      TEXT    UNIQUE,
  estado            TEXT    NOT NULL DEFAULT 'Disponible'
                    CHECK (estado IN ('Disponible','Prestado','En Reparación','En Instalación','De Baja')),
  sede              TEXT    NOT NULL,
  ubicacion         TEXT,
  fecha_adquisicion TEXT,
  valor_adquisicion REAL,
  vida_util_meses   INTEGER NOT NULL DEFAULT 48,
  creado_en         TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Estado fisico por componente. Lo registra y mantiene TIC (Admin / Tecnico).
-- El Empleado NUNCA lo modifica: solo lo ve y lo acepta (RF02).
CREATE TABLE IF NOT EXISTS componente_equipo (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  equipo_id          INTEGER NOT NULL REFERENCES equipo(id) ON DELETE CASCADE,
  nombre             TEXT    NOT NULL,
  estado             TEXT    NOT NULL DEFAULT 'bueno' CHECK (estado IN ('bueno','regular','malo')),
  observacion        TEXT,
  actualizado_en     TEXT    NOT NULL DEFAULT (datetime('now')),
  actualizado_por_id INTEGER REFERENCES usuario_sistema(id),
  UNIQUE (equipo_id, nombre)
);

-- Cabecera del "carrito de retiro": agrupa varios prestamos formalizados juntos
-- con una unica aceptacion del Empleado por PIN.
CREATE TABLE IF NOT EXISTS retiro (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  empleado_id       INTEGER NOT NULL REFERENCES empleado(id),
  estado            TEXT    NOT NULL DEFAULT 'Activo' CHECK (estado IN ('Activo','Parcial','Devuelto')),
  aceptado_con_pin  INTEGER NOT NULL DEFAULT 0,
  fecha_aceptacion  TEXT,
  fecha_retiro      TEXT    NOT NULL DEFAULT (datetime('now')),
  observaciones     TEXT,
  creado_en         TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS prestamo (
  id                        INTEGER PRIMARY KEY AUTOINCREMENT,
  retiro_id                 INTEGER REFERENCES retiro(id),
  empleado_id               INTEGER NOT NULL REFERENCES empleado(id),
  equipo_id                 INTEGER NOT NULL REFERENCES equipo(id),
  estado                    TEXT    NOT NULL DEFAULT 'Activo' CHECK (estado IN ('Activo','Devuelto')),
  fecha_prestamo            TEXT    NOT NULL DEFAULT (datetime('now')),
  fecha_devolucion_esperada TEXT,
  fecha_devolucion_real     TEXT,
  aceptado_con_pin          INTEGER NOT NULL DEFAULT 0,
  fecha_aceptacion          TEXT,
  devolucion_solicitada     INTEGER NOT NULL DEFAULT 0,
  fecha_solicitud_devolucion TEXT,
  checklist_salida_id       INTEGER REFERENCES checklist_estado(id),
  checklist_recepcion_id    INTEGER REFERENCES checklist_estado(id),
  observaciones             TEXT,
  creado_en                 TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Foto del estado fisico en un momento dado: 'salida' = lo que el Empleado
-- acepto al retirar; 'recepcion' = lo que TIC constata al recibir (HU04).
CREATE TABLE IF NOT EXISTS checklist_estado (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  prestamo_id        INTEGER REFERENCES prestamo(id),
  tipo               TEXT    NOT NULL CHECK (tipo IN ('salida','recepcion')),
  items_json         TEXT    NOT NULL,
  observaciones      TEXT,
  tiene_dano         INTEGER NOT NULL DEFAULT 0,
  realizado_por_tipo TEXT    NOT NULL,
  realizado_por_id   INTEGER,
  creado_en          TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS incidencia (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  prestamo_id       INTEGER REFERENCES prestamo(id),
  equipo_id         INTEGER NOT NULL REFERENCES equipo(id),
  reportado_por_tipo TEXT   NOT NULL,
  reportado_por_id  INTEGER,
  descripcion       TEXT    NOT NULL,
  severidad         TEXT    NOT NULL DEFAULT 'media' CHECK (severidad IN ('baja','media','alta')),
  estado            TEXT    NOT NULL DEFAULT 'Abierta' CHECK (estado IN ('Abierta','En proceso','Cerrada')),
  fecha_reporte     TEXT    NOT NULL DEFAULT (datetime('now')),
  fecha_cierre      TEXT
);

CREATE TABLE IF NOT EXISTS mantenimiento (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  equipo_id         INTEGER NOT NULL REFERENCES equipo(id),
  tipo              TEXT    NOT NULL CHECK (tipo IN ('Preventivo','Correctivo')),
  descripcion       TEXT    NOT NULL,
  costo             REAL    DEFAULT 0,
  realizado_por     TEXT,
  fecha_inicio      TEXT    NOT NULL DEFAULT (datetime('now')),
  fecha_fin         TEXT,
  estado            TEXT    NOT NULL DEFAULT 'En proceso' CHECK (estado IN ('En proceso','Finalizado'))
);

CREATE TABLE IF NOT EXISTS software_instalado (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  equipo_id         INTEGER NOT NULL REFERENCES equipo(id),
  nombre            TEXT    NOT NULL,
  version           TEXT,
  licencia          TEXT,
  fecha_instalacion TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS log_auditoria (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  fecha             TEXT    NOT NULL DEFAULT (datetime('now')),
  actor_tipo        TEXT    NOT NULL,
  actor_id          INTEGER,
  accion            TEXT    NOT NULL,
  entidad           TEXT,
  entidad_id        INTEGER,
  detalle_json      TEXT,
  ip                TEXT
);

-- RF07 / RN03: la bitacora es de solo lectura. Garantizado en la propia BD.
CREATE TRIGGER IF NOT EXISTS log_auditoria_no_update
BEFORE UPDATE ON log_auditoria
BEGIN
  SELECT RAISE(ABORT, 'log_auditoria es de solo lectura: no se puede editar');
END;

CREATE TRIGGER IF NOT EXISTS log_auditoria_no_delete
BEFORE DELETE ON log_auditoria
BEGIN
  SELECT RAISE(ABORT, 'log_auditoria es de solo lectura: no se puede borrar');
END;

CREATE INDEX IF NOT EXISTS idx_equipo_estado ON equipo(estado);
CREATE INDEX IF NOT EXISTS idx_equipo_categoria ON equipo(categoria);
CREATE INDEX IF NOT EXISTS idx_componente_equipo ON componente_equipo(equipo_id);
CREATE INDEX IF NOT EXISTS idx_prestamo_equipo ON prestamo(equipo_id);
CREATE INDEX IF NOT EXISTS idx_prestamo_empleado ON prestamo(empleado_id);
CREATE INDEX IF NOT EXISTS idx_prestamo_estado ON prestamo(estado);
CREATE INDEX IF NOT EXISTS idx_prestamo_retiro ON prestamo(retiro_id);
CREATE INDEX IF NOT EXISTS idx_retiro_empleado ON retiro(empleado_id);
CREATE INDEX IF NOT EXISTS idx_log_fecha ON log_auditoria(fecha);
`;

/** Crea tablas, triggers e indices si no existen. */
function ejecutarMigraciones() {
  obtenerConexion().exec(DDL);
}

module.exports = { ejecutarMigraciones };
