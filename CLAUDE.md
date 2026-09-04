# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Qué es este proyecto

**Sistema de Trazabilidad e Inventario TIC Multi-Sede** — v1.

API REST + PWA offline-first para registrar equipos TIC, formalizar préstamos a
empleados mediante PIN (carrito de "retiro" de varios equipos a la vez), llevar
el estado físico por componente de cada equipo, incidencias, mantenimientos y una
bitácora de auditoría inmutable.

**Principio clave del dominio:** el estado físico de cada componente de un equipo
lo registra y mantiene **el área de TIC (Admin/Técnico)** en `componente_equipo`.
El Empleado NUNCA lo asigna ni lo modifica: al retirar solo lo **ve y lo acepta**
(checklist de solo lectura + PIN, RF02).

Es una actividad evaluada: las **buenas prácticas** y las **historias de usuario**
de abajo son requisitos, no sugerencias. No cambiar el alcance ni los criterios
de aceptación sin pedirlo.

## Stack

| Capa      | Tecnología |
|-----------|------------|
| Runtime   | Node.js **≥ 22.5.0** (LTS 22 "Jod" o superior) |
| API       | Express 4 (CommonJS, `require`) |
| BD        | **`node:sqlite`** (`DatabaseSync`), módulo nativo. En Node 22.x requiere el flag `--experimental-sqlite` (ya incluido en los scripts de npm). En Node ≥ 24 el flag es opcional; si diera error, quitarlo de `package.json`. |
| Auth      | JWT (`jsonwebtoken`) para staff; token JWT de audiencia separada para el PIN de empleado |
| Env       | `node --env-file=.env` (sin dependencia `dotenv`) |
| Frontend  | PWA vanilla: HTML/CSS/JS, `manifest.json`, `service-worker.js` (offline-first) |
| Tests     | `node --test` (runner nativo) |

Dependencias de producción: `express`, `jsonwebtoken`. Nada más — hashing y JWT
auxiliar usan `node:crypto`.

## Comandos

```bash
npm install
npm run seed      # crea/recrea data/inventario.db con datos demo (ver PINs abajo)
npm run dev       # servidor con --watch en http://localhost:3000
npm start         # servidor sin watch
npm test          # toda la suite (node --test)
node --test --experimental-sqlite tests/flujoRetiro.test.js   # un solo archivo
```

Copiar `.env.example` a `.env` antes de arrancar. En **producción** el arranque
falla si `JWT_SECRET` o `PIN_PEPPER` conservan el valor de ejemplo.

`npm run seed` hace **DROP + CREATE** de todas las tablas salvo `log_auditoria`
(inmutable): en desarrollo, cuando cambie el esquema en `models/esquema.js`, basta
volver a correr el seed. No hay sistema de migraciones incremental todavía.

### Credenciales demo (tras `npm run seed`)

- Empleados (login solo con PIN): `123456`, `234567`, `345678`
- Staff (usuario / contraseña): `admin / Admin123*` (Admin), `tecnico / Tecnico123*` (Técnico)

## Arquitectura

Paquetes en la raíz (un archivo = una responsabilidad; **la lógica de negocio
nunca vive en `routes/` ni en `controllers/`**):

```
config/       config.js (env), database.js (conexión + BEGIN/COMMIT), constantes.js
models/       una tabla por entidad + esquema.js (todas las CREATE TABLE / triggers)
services/     reglas de negocio (ver abajo)
controllers/  un archivo por recurso; solo orquesta: valida entrada, llama service, responde
routes/       un archivo por recurso; index.js las monta todas en /api
middlewares/  authJWT, authPIN, autenticacionMixta, rateLimitPIN, errorHandler
utils/        errores.js, hash.js, jwt.js, validacion.js, estadoEquipo.js
public/       PWA. Páginas: index.html (login PIN empleado, oscuro), staff.html
              (login usuario/contraseña TIC, oscuro), catalogo.html (empleado,
              claro), panel.html (TIC: cola de devoluciones, claro). iconos.js = SVG por categoría
scripts/      seed.js (DROP + CREATE + datos demo)
tests/        node:test — flujoRetiro.test.js (HU01/02/04), flujoIncidencia.test.js (HU03)
app.js        arma el Express app (parsers, /api, estáticos, 404, errorHandler)
servidor.js   inicializa la BD y hace listen()
```

- `utils/estadoEquipo.js`: componentes válidos por categoría, `tieneDano`,
  `resumirEstado` (Buen estado / Con detalles / Con daños), `normalizarEntradaComponentes`.
- `middlewares/autenticacionMixta.js`: acepta token PIN **o** JWT staff (para el catálogo, HU02).

### Flujo de una petición

`routes/` → `middlewares/` (auth + rate limit) → `controllers/` (try/catch,
parsea/valida el body, formatea la respuesta) → `services/` (todas las reglas
de negocio y transacciones) → `models/` (SQL puro, sin lógica).

Todo error se propaga con `next(error)` a `middlewares/errorHandler.js`, que
responde `{ error: { codigo, mensaje } }` — **nunca un stack trace al cliente**;
los 5xx se registran solo en el servidor.

### Services

| Service | Responsabilidad |
|---------|-----------------|
| `PrestamoService` | `registrarRetiroConPin` (HU01) y `registrarDevolucion` (HU04). Dueño de RN01, RN02, RN04. Transacción: `retiro` + N × (checklist salida + `prestamo` + estado del equipo + log). |
| `IncidenciaService` | `reportarIncidencia` (empleado, HU03) y `triarIncidencia` (staff: severidad + estado + notas). Reportar NO cambia `equipo.estado`. |
| `AuditoriaService` | `registrar()`, `consultar()` (interno) y `consultarBitacora()` (HU06: filtros + paginación + nombre del actor resuelto) + `accionesRegistradas()`. **Nunca** update/delete: única vía a `log_auditoria`. |
| `DepreciacionService` | Vida útil / valor residual del equipo (línea recta sobre `vida_util_meses`). Alimenta HU05. |
| `NotificacionService` | Punto único de notificaciones (préstamo vencido, incidencia, etc.). En v1 registra en consola/log. |

### Autenticación (RF01 / RNF05)

- **Admin y Técnico**: `usuario` + `contraseña` → JWT (audiencia `staff`, claim `rol`).
  Contraseña con `scrypt` (`node:crypto`). Middleware `authJWT(['Admin','Técnico'])`.
- **Empleado**: **solo un PIN de 6 dígitos**, único por empleado. No tiene cuenta
  completa. El PIN se guarda como `HMAC-SHA256(pin, PIN_PEPPER)` (determinista →
  índice `UNIQUE` y búsqueda O(1)). El login devuelve un JWT de audiencia
  `empleado-pin` de corta duración. Middleware `authPIN`.
- **Bloqueo (RNF05)**: `middlewares/rateLimitPIN.js` cuenta intentos fallidos
  **por IP** (el login no lleva identificador). 3 fallos → 429 durante 15 min.
  Éxito reinicia el contador. Constantes en `config/constantes.js`.
- **RN02**: confirmar un retiro exige reenviar el PIN en el body además del
  token — esa es la "aceptación explícita del empleado".

## Entidades (DER)

`empleado`, `usuario_sistema`, `equipo`, `componente_equipo`, `retiro`,
`prestamo`, `checklist_estado`, `incidencia`, `mantenimiento`,
`software_instalado`, `log_auditoria`.

Todas las CREATE TABLE y los triggers viven en `models/esquema.js`
(`CREATE TABLE IF NOT EXISTS`). `PRAGMA foreign_keys = ON`.

- **`equipo`**: `categoria` (Laptop, Monitor, Mouse, Teclado, Cargador,
  Proyector), `nombre` (título de la tarjeta), `estado` = `Disponible` |
  `Prestado` | `En Reparación` | `En Instalación` | `De Baja`.
- **`componente_equipo`**: `(equipo_id, nombre)` único. `estado` =
  `bueno` | `regular` | `malo` + `observacion`. Los componentes válidos por
  categoría están en `COMPONENTES_POR_CATEGORIA` (`config/constantes.js`); al dar
  de alta un equipo se crean sus filas. Lo edita **solo TIC**.
- **`retiro`**: cabecera del carrito. `estado` = `Activo` | `Parcial` |
  `Devuelto`. `aceptado_con_pin`, `fecha_aceptacion`. Un `retiro` agrupa N
  `prestamo` (`prestamo.retiro_id`).
- **`prestamo`**: `estado` = `Activo` | `Devuelto`. Uno por equipo.
- **`checklist_estado`**: `tipo` = `salida` | `recepcion`. `items_json` =
  `{ "<componente>": { "estado", "observacion" } }`, `tiene_dano = 1` si algún
  componente quedó en `malo`.
  - **salida**: foto del estado que TIC tenía registrado, copiada al formalizar
    el retiro. `realizado_por_tipo = 'Sistema'` (no la escribe el empleado).
  - **recepcion**: lo que TIC constata al recibir (HU04); `realizado_por_tipo`
    es el rol del staff. También actualiza `componente_equipo`.
- **`prestamo`** también lleva `devolucion_solicitada` / `fecha_solicitud_devolucion`:
  el empleado marca que va a devolver (HU04 paso 1); TIC lo cierra al certificar
  la recepción (paso 2).
- **`incidencia`** (HU03): el empleado solo escribe `descripcion` (texto libre).
  Nace `severidad = 'sin clasificar'`, `estado = 'Abierta'`. TIC la tría:
  `severidad` ∈ {baja, media, alta}, `estado` ∈ {Abierta, En proceso, Cerrada},
  `notas_tic`, `atendida_por_id`, `fecha_cierre`. Reportarla **no** toca
  `equipo.estado`; RN04 la considera al devolver (`estado != 'Cerrada'` = abierta).
- **`log_auditoria`**: append-only. Triggers `BEFORE UPDATE` / `BEFORE DELETE`
  hacen `RAISE(ABORT, ...)`. No tiene columnas de edición ni borrado. Guarda
  `actor_id` (int); la bitácora de HU06 resuelve el nombre en la consulta
  (usuario de staff o `nombres || apellidos` del empleado, o el `actor_tipo` para
  `Sistema`).

## Reglas de negocio (implementar tal cual)

| Regla | Dónde | Qué hace |
|-------|-------|----------|
| **RF01 / RNF05** | `authController`, `authJWT`, `authPIN`, `rateLimitPIN` | Staff = usuario+contraseña (JWT). Empleado = solo PIN de 6 dígitos (hash). 3 PIN fallidos → bloqueo 15 min. |
| **RF02 / RN02** | `PrestamoService.registrarRetiroConPin` | Un retiro no es válido sin checklist de **salida** (foto del estado) Y reenvío del PIN del empleado. El empleado solo acepta un checklist de **solo lectura**. |
| **RN01** | `PrestamoService.asegurarEquipoPrestable` | Un equipo en `Prestado`, `En Reparación`, `En Instalación` o `De Baja` **no** puede prestarse. Solo `Disponible`. Si un equipo del carrito falla, se rechaza **todo** el retiro. → 409. |
| **RN04** | `PrestamoService.registrarDevolucion` | La devolución tiene 2 pasos: (1) el empleado la **solicita** (`solicitarDevolucion`, marca `devolucion_solicitada`, no cierra nada); (2) TIC **certifica la recepción** con checklist editable. Si ese checklist marca `malo` **o** hay una incidencia abierta (HU03) → el equipo pasa **automáticamente** a `En Reparación`. |
| **RF07 / RN03 / RNF02** | `AuditoriaService` + triggers de BD + `bitacoraController` | Los logs son solo lectura: ni editables ni borrables (en código **y** en la BD). La vista de HU06 (`panel.html`, solo Admin) solo lista/filtra — no hay ningún control de editar o borrar en la interfaz. |
| **HU03 (principio)** | `IncidenciaService` | El empleado **solo describe** el problema en texto libre. No clasifica ni cambia el estado del equipo — eso lo decide TIC al triar (mismo principio que el checklist de préstamo/devolución). |

## Historias de usuario (alcance v1)

Los criterios Dado/Cuando/Entonces se implementan literalmente porque después se
vuelven casos de prueba funcionales.

| HU | Título | Endpoints/pantallas principales |
|----|--------|--------------------------------|
| **HU01** | Registro y formalización de préstamo con PIN | `POST /api/auth/pin`, `POST /api/retiros`; `index.html` (login PIN) → `catalogo.html` (carrito + PIN) |
| **HU02** | Consulta de catálogo y estado de asignación actual | `GET /api/catalogo`, `GET /api/catalogo/:id`, `GET /api/retiros/mios`; `catalogo.html` en tarjetas por categoría |
| **HU03** | Reporte de incidencias durante el préstamo | Empleado: `POST /api/incidencias` + `GET /api/incidencias/mias` (botón "Reportar incidencia" en el banner de `catalogo.html`). TIC: `GET /api/incidencias` + `PATCH /api/incidencias/:id` (pestaña "Incidencias" de `panel.html`) |
| **HU04** | Devolución de equipo y checklist de recepción | Empleado: `GET /api/prestamos/mios-activos` + `POST /api/prestamos/:id/solicitar-devolucion` (banner en `catalogo.html`). TIC: `staff.html` (login) → `panel.html` → `GET /api/prestamos/pendientes` + `POST /api/prestamos/:id/devolucion` |
| **HU05** | Dashboard interactivo y vida útil | `GET /api/dashboard`, `DepreciacionService` |
| **HU06** | Consulta y auditoría de bitácora de logs | `GET /api/logs` + `GET /api/logs/acciones` (**solo Admin**, solo lectura); pestaña "Bitácora de auditoría" en `panel.html` con filtros de fecha / usuario / acción / tipo de actor y paginación |

### Cómo llegar a cada flujo (navegación)

| Flujo | Ruta de entrada |
|-------|-----------------|
| Empleado retira equipos | `/` → PIN → `catalogo.html` → seleccionar tarjetas → "Revisar retiro" → PIN |
| Empleado **solicita** devolución | `/` → PIN → `catalogo.html` → banner **"Tienes N equipos prestados"** (arriba de todo) → "Solicitar devolución" |
| Empleado **reporta incidencia** | `/` → PIN → `catalogo.html` → banner → "Reportar incidencia" → describe en texto libre |
| TIC certifica la recepción | `/` → enlace **"¿Eres del área de TIC? Inicia sesión aquí"** → `staff.html` → usuario/contraseña → `panel.html` → pestaña "Devoluciones pendientes" → "Certificar recepción" |
| TIC tría incidencias | `staff.html` → `panel.html` → pestaña **"Incidencias"** → "Atender" (severidad + estado + notas) |
| Admin consulta la bitácora | `staff.html` (login **admin**) → `panel.html` → pestaña **"Bitácora de auditoría"** (solo aparece para rol Admin) |

### Estado: qué está completo y verificado

| HU | Estado | Verificación |
|----|--------|--------------|
| **HU01** Retiro con PIN | ✅ backend + PWA | tests + navegador |
| **HU02** Catálogo y estado de asignación | ✅ backend + PWA | tests + navegador |
| **HU03** Reporte de incidencias + triage TIC | ✅ backend + PWA | tests + navegador |
| **HU04** Devolución + checklist de recepción | ✅ backend + PWA | tests + navegador |
| **HU06** Bitácora de auditoría (rol Admin) | ✅ backend + PWA | tests + navegador |
| HU05 Dashboard / vida útil | ⛔ no empezada (`DepreciacionService` ya existe) | — |

**Pruebas automáticas** — `npm test`, **29/29**:

- `tests/flujoRetiro.test.js` (13): HU01 multi-equipo; RN02; RN01 (rechazo total);
  "el empleado no fija el estado"; RN04 con/sin daño; retiro parcial; HU04
  (solicitud, préstamo ajeno, orden de la cola); RF07/RN03 (bitácora inmutable en BD);
  RNF05; validaciones.
- `tests/flujoIncidencia.test.js` (9): el reporte nace `sin clasificar`/`Abierta`
  y **no** cambia el estado del equipo; descripción muy corta rechazada; no se puede
  reportar sobre préstamo ajeno ni devuelto; **RN04 con incidencia abierta** →
  `En Reparación` aunque el checklist esté limpio; triage de TIC (severidad +
  cierre); TIC no puede asignar `sin clasificar`; la cola pone `sin clasificar`
  primero; el empleado solo ve sus propias incidencias.
- `tests/flujoBitacora.test.js` (7): resuelve el nombre del actor y ordena por
  fecha desc; filtros por usuario (LIKE parcial), tipo de actor, acción y rango
  de fechas (`hasta` con solo fecha incluye el día completo); paginación;
  `accionesRegistradas` sin duplicados y ordenadas; RN03 (ni el service ni la BD
  permiten modificarla).

**Prueba manual en navegador** (Chrome, Node 22, `npm run seed`): los flujos de
punta a punta — empleado retira / reporta incidencia (badge "1 incidencia en
revisión") / solicita devolución; TIC entra por `staff.html`, tría la incidencia
y certifica la recepción; **Admin** abre la pestaña "Bitácora de auditoría",
filtra por usuario y pagina (el Técnico no ve esa pestaña ni el endpoint → 403).

### Qué falta, en orden

1. **HU05 — Dashboard** (`DepreciacionService.calcularVidaUtil` ya está):
   `GET /api/dashboard` (equipos por estado, préstamos activos, top vida útil
   consumida, alertas de reparación). Pantalla con gráficos simples.
2. **Edición del estado físico por TIC**: `PATCH /api/equipos/:id/componentes`
   (`authJWT` staff) para que Admin/Técnico ajusten `componente_equipo` fuera de
   una devolución (alta de equipo, mantenimiento). Hoy solo se actualiza al
   certificar una recepción.
3. **Migraciones**: si el proyecto va más allá de la demo, reemplazar el
   `DROP + CREATE` del seed por migraciones incrementales.

Pulidos opcionales (según lo que pida el enunciado): la devolución se puede
certificar aunque el empleado no la haya "solicitado" (la solicitud solo
reordena la cola); no hay endpoint de "cerrar/resolver" incidencia separado del
triage genérico.

### Decisiones de diseño (no evidentes solo en el código)

- **El estado físico lo mantiene TIC, no el empleado.** Corrección de un diseño
  inicial que dejaba al empleado marcar bueno/regular/malo en el préstamo. Ahora
  vive en `componente_equipo` (editable solo por Admin/Técnico) y el empleado lo
  ve en **solo lectura**. El checklist de salida es una *foto* de ese estado.
- **Incidencias (HU03): mismo principio.** El empleado solo escribe texto libre;
  la incidencia nace `severidad = 'sin clasificar'` (valor añadido al CHECK del
  DER a propósito) / `estado = 'Abierta'`. TIC clasifica y mueve el estado en la
  pestaña "Incidencias" de `panel.html`. Reportar **no** cambia el estado del
  equipo: el enganche a `En Reparación` ocurre solo en la devolución (RN04).
- **Triage genérico, no acciones separadas.** `PATCH /api/incidencias/:id` con
  `{severidad?, estado?, notasTic?}` cubre clasificar, avanzar y cerrar. TIC no
  puede volver a `sin clasificar` (`SEVERIDADES_TRIAGE`). Al pasar a `Cerrada`
  se fija `fecha_cierre`; al reabrir se limpia.
- **Componentes por categoría, no una lista global.** Un mouse no tiene
  "pantalla". `COMPONENTES_POR_CATEGORIA` define el set por categoría de equipo;
  se instancian en `componente_equipo` al crear el equipo (hoy solo el seed).
- **Carrito de "retiro" con cabecera propia.** Se eligió una tabla `retiro`
  (no un UUID de grupo en `prestamo`) para tener dónde colgar la aceptación por
  PIN, el estado `Activo/Parcial/Devuelto` y datos a nivel de operación. Un
  `POST /api/retiros` reemplazó al viejo `POST /api/prestamos`.
- **RN01 sobre el carrito: todo o nada.** Si un solo equipo del carrito no está
  `Disponible`, se rechaza el retiro completo (no se prestan los demás).
- **Devolución en 2 pasos y 2 roles.** El empleado *solicita* (no evalúa nada);
  TIC *certifica la recepción* con el checklist editable y dispara RN04. Fue
  necesario añadir `prestamo.devolucion_solicitada` y las pantallas
  `staff.html` + `panel.html`, porque no había forma de entrar como staff ni de
  llegar a la devolución desde la interfaz.
- **`node:sqlite` requiere Node ≥ 22.5.** El entorno tenía Node 20; se instaló
  Node 22.11 vía nvm-windows. Los scripts de npm llevan `--experimental-sqlite`.
- **PIN solo (sin identificador).** Por eso el bloqueo de RNF05 es **por IP** y
  el hash del PIN es un **HMAC determinista** (permite `UNIQUE` y lookup O(1)),
  no bcrypt/scrypt. Las contraseñas de staff sí usan `scrypt`.
- **Inmutabilidad de la bitácora reforzada en la BD**, no solo en el código:
  triggers `BEFORE UPDATE/DELETE` con `RAISE(ABORT)` en `log_auditoria`.
- **Tema visual:** login (`index.html`, `staff.html`) oscuro; app
  (`catalogo.html`, `panel.html`) clara. `service-worker.js` cachea el shell
  (cache-first) y **nunca** `/api/*`. Al cambiar assets hay que subir `CACHE`
  (va por `inv-tic-vN`).

## Convenciones de código

- **Nombres en español**, descriptivos y consistentes con las entidades del DER
  (`registrarRetiroConPin`, `asegurarEquipoPrestable`, `checklistSalida`, no
  `createLoan` ni `data`).
- Componente físico en el frontend: para el **empleado** siempre **solo lectura**
  (`renderChecklistLectura` en `public/js/catalogo.js`, colores fijos
  verde/amarillo/rojo, sin controles). El único checklist **editable** es el de
  recepción en `public/js/panel.js`, y solo lo usa el staff.
- Cada método de `controllers/` va envuelto en `try/catch` y termina en
  `next(error)`; nunca deja escapar una excepción sin traducir.
- Errores de negocio: lanzar `new ErrorAplicacion(mensaje, codigoHttp, codigo)`
  desde `utils/errores.js`. El `errorHandler` los formatea.
- SQL solo en `models/`. Parámetros posicionales (`?`). `lastInsertRowid` se
  convierte con `Number()` (viene como BigInt).
- Transacciones vía `enTransaccion(fn)` de `config/database.js`.
