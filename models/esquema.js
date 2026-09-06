'use strict';

const { query } = require('../config/database');

/**
 * Definición completa del esquema en PostgreSQL más las funciones/triggers
 * que garantizan la inmutabilidad de `log_auditoria` (RF07 / RN03).
 */
const DDL = `
CREATE TABLE IF NOT EXISTS empleado (
  id                SERIAL PRIMARY KEY,
  cedula            VARCHAR(20) NOT NULL UNIQUE,
  nombres           VARCHAR(100) NOT NULL,
  apellidos         VARCHAR(100) NOT NULL,
  correo            VARCHAR(150) UNIQUE,
  cargo             VARCHAR(100),
  sede              VARCHAR(100) NOT NULL,
  pin_hash          VARCHAR(255) NOT NULL UNIQUE,
  activo            SMALLINT NOT NULL DEFAULT 1,
  creado_en         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS usuario_sistema (
  id                SERIAL PRIMARY KEY,
  empleado_id       INTEGER REFERENCES empleado(id),
  usuario           VARCHAR(50) NOT NULL UNIQUE,
  password_hash     VARCHAR(255) NOT NULL,
  rol               VARCHAR(20) NOT NULL CHECK (rol IN ('Admin','Técnico')),
  activo            SMALLINT NOT NULL DEFAULT 1,
  creado_en         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS equipo (
  id                SERIAL PRIMARY KEY,
  codigo_interno    VARCHAR(50) NOT NULL UNIQUE,
  nombre            VARCHAR(150) NOT NULL,
  categoria         VARCHAR(100) NOT NULL,
  marca             VARCHAR(100),
  modelo            VARCHAR(100),
  numero_serie      VARCHAR(100) UNIQUE,
  estado            VARCHAR(50) NOT NULL DEFAULT 'Disponible'
                    CHECK (estado IN ('Disponible','Prestado','En Reparación','En Instalación','De Baja')),
  sede              VARCHAR(100) NOT NULL,
  ubicacion         VARCHAR(150),
  fecha_adquisicion DATE,
  valor_adquisicion NUMERIC(12, 2),
  vida_util_meses   INTEGER NOT NULL DEFAULT 48,
  creado_en         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS componente_equipo (
  id                SERIAL PRIMARY KEY,
  equipo_id         INTEGER NOT NULL REFERENCES equipo(id) ON DELETE CASCADE,
  nombre            VARCHAR(100) NOT NULL,
  estado            VARCHAR(20) NOT NULL DEFAULT 'bueno' CHECK (estado IN ('bueno','regular','malo')),
  observacion       TEXT,
  actualizado_en    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_por_id INTEGER REFERENCES usuario_sistema(id),
  UNIQUE (equipo_id, nombre)
);

CREATE TABLE IF NOT EXISTS retiro (
  id                SERIAL PRIMARY KEY,
  empleado_id       INTEGER NOT NULL REFERENCES empleado(id),
  estado            VARCHAR(20) NOT NULL DEFAULT 'Activo' CHECK (estado IN ('Activo','Parcial','Devuelto')),
  aceptado_con_pin  SMALLINT NOT NULL DEFAULT 0,
  fecha_aceptacion  TIMESTAMP WITH TIME ZONE,
  fecha_retiro      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  observaciones     TEXT,
  creado_en         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS checklist_estado (
  id                SERIAL PRIMARY KEY,
  prestamo_id       INTEGER,
  tipo              VARCHAR(20) NOT NULL CHECK (tipo IN ('salida','recepcion')),
  items_json        TEXT NOT NULL,
  observaciones     TEXT,
  tiene_dano        SMALLINT NOT NULL DEFAULT 0,
  realizado_por_tipo VARCHAR(50) NOT NULL,
  realizado_por_id  INTEGER,
  creado_en         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS prestamo (
  id                        SERIAL PRIMARY KEY,
  retiro_id                 INTEGER REFERENCES retiro(id),
  empleado_id               INTEGER NOT NULL REFERENCES empleado(id),
  equipo_id                 INTEGER NOT NULL REFERENCES equipo(id),
  estado                    VARCHAR(20) NOT NULL DEFAULT 'Activo' CHECK (estado IN ('Activo','Devuelto')),
  fecha_prestamo            TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_devolucion_esperada TIMESTAMP WITH TIME ZONE,
  fecha_devolucion_real     TIMESTAMP WITH TIME ZONE,
  aceptado_con_pin          SMALLINT NOT NULL DEFAULT 0,
  fecha_aceptacion          TIMESTAMP WITH TIME ZONE,
  devolucion_solicitada     SMALLINT NOT NULL DEFAULT 0,
  fecha_solicitud_devolucion TIMESTAMP WITH TIME ZONE,
  checklist_salida_id       INTEGER REFERENCES checklist_estado(id),
  checklist_recepcion_id    INTEGER REFERENCES checklist_estado(id),
  observaciones             TEXT,
  creado_en                 TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE checklist_estado
  ADD CONSTRAINT fk_checklist_prestamo
  FOREIGN KEY (prestamo_id) REFERENCES prestamo(id);

CREATE TABLE IF NOT EXISTS incidencia (
  id                  SERIAL PRIMARY KEY,
  prestamo_id         INTEGER REFERENCES prestamo(id),
  equipo_id           INTEGER NOT NULL REFERENCES equipo(id),
  reportado_por_tipo  VARCHAR(50) NOT NULL,
  reportado_por_id    INTEGER,
  descripcion         TEXT NOT NULL,
  severidad           VARCHAR(20) NOT NULL DEFAULT 'sin clasificar'
                      CHECK (severidad IN ('sin clasificar','baja','media','alta')),
  estado              VARCHAR(20) NOT NULL DEFAULT 'Abierta'
                      CHECK (estado IN ('Abierta','En proceso','Cerrada')),
  notas_tic           TEXT,
  atendida_por_id     INTEGER REFERENCES usuario_sistema(id),
  fecha_reporte       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_actualizacion TIMESTAMP WITH TIME ZONE,
  fecha_cierre        TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS mantenimiento (
  id                SERIAL PRIMARY KEY,
  equipo_id         INTEGER NOT NULL REFERENCES equipo(id),
  tipo              VARCHAR(20) NOT NULL CHECK (tipo IN ('Preventivo','Correctivo')),
  descripcion       TEXT NOT NULL,
  costo             NUMERIC(12, 2) DEFAULT 0,
  realizado_por     VARCHAR(150),
  fecha_inicio      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_fin         TIMESTAMP WITH TIME ZONE,
  estado            VARCHAR(20) NOT NULL DEFAULT 'En proceso' CHECK (estado IN ('En proceso','Finalizado'))
);

CREATE TABLE IF NOT EXISTS software_instalado (
  id                SERIAL PRIMARY KEY,
  equipo_id         INTEGER NOT NULL REFERENCES equipo(id),
  nombre            VARCHAR(150) NOT NULL,
  version           VARCHAR(50),
  licencia          VARCHAR(100),
  fecha_instalacion TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS log_auditoria (
  id                SERIAL PRIMARY KEY,
  fecha             TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actor_tipo        VARCHAR(50) NOT NULL,
  actor_id          INTEGER,
  accion            VARCHAR(100) NOT NULL,
  entidad           VARCHAR(100),
  entidad_id        INTEGER,
  detalle_json      TEXT,
  ip                VARCHAR(45)
);

-- Trigger PL/pgSQL para garantizar inmutabilidad de la auditoria (RF07 / RN03)
CREATE OR REPLACE FUNCTION denegar_modificacion_log_auditoria()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'log_auditoria es de solo lectura: no se permite modificacion ni borrado';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_log_auditoria_no_update ON log_auditoria;
CREATE TRIGGER trg_log_auditoria_no_update
BEFORE UPDATE ON log_auditoria
FOR EACH ROW EXECUTE FUNCTION denegar_modificacion_log_auditoria();

DROP TRIGGER IF EXISTS trg_log_auditoria_no_delete ON log_auditoria;
CREATE TRIGGER trg_log_auditoria_no_delete
BEFORE DELETE ON log_auditoria
FOR EACH ROW EXECUTE FUNCTION denegar_modificacion_log_auditoria();

CREATE INDEX IF NOT EXISTS idx_equipo_estado ON equipo(estado);
CREATE INDEX IF NOT EXISTS idx_equipo_categoria ON equipo(categoria);
CREATE INDEX IF NOT EXISTS idx_componente_equipo ON componente_equipo(equipo_id);
CREATE INDEX IF NOT EXISTS idx_prestamo_equipo ON prestamo(equipo_id);
CREATE INDEX IF NOT EXISTS idx_prestamo_empleado ON prestamo(empleado_id);
CREATE INDEX IF NOT EXISTS idx_prestamo_estado ON prestamo(estado);
CREATE INDEX IF NOT EXISTS idx_prestamo_retiro ON prestamo(retiro_id);
CREATE INDEX IF NOT EXISTS idx_retiro_empleado ON retiro(empleado_id);
CREATE INDEX IF NOT EXISTS idx_incidencia_prestamo ON incidencia(prestamo_id);
CREATE INDEX IF NOT EXISTS idx_incidencia_estado ON incidencia(estado);
CREATE INDEX IF NOT EXISTS idx_log_fecha ON log_auditoria(fecha);
`;

/** Crea tablas, triggers e índices si no existen de forma asíncrona. */
async function ejecutarMigraciones() {
  await query(DDL);
}

module.exports = { ejecutarMigraciones };