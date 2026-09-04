# Sistema de Trazabilidad e Inventario TIC Multi-Sede

Aplicación web para gestionar el préstamo, la devolución, las incidencias y la
vida útil de equipos TIC (laptops, monitores, mouses, teclados, cargadores,
proyectores) en varias sedes.

- **API REST** en Node.js + Express + SQLite.
- **PWA** (Progressive Web App) offline-first en HTML/CSS/JS sin frameworks.
- **Empleados** se autentican solo con un PIN de 6 dígitos; **Administrador y
  Técnico** con usuario y contraseña.

**Demo en línea:** https://inventario-tic-h9j3.onrender.com
*(alojado en Render free: el primer acceso puede tardar ~30 s si el servicio
estaba dormido).*

> Documentación técnica interna (arquitectura, decisiones de diseño, reglas de
> negocio detalladas): [`CLAUDE.md`](./CLAUDE.md).

---

## Tabla de contenido

- [Funcionalidades](#funcionalidades)
- [Stack tecnológico](#stack-tecnológico)
- [Requisitos previos](#requisitos-previos)
- [Instalación paso a paso (local)](#instalación-paso-a-paso-local)
- [Credenciales de demostración](#credenciales-de-demostración)
- [Cómo usar la aplicación](#cómo-usar-la-aplicación)
- [Scripts de npm](#scripts-de-npm)
- [Pruebas automáticas](#pruebas-automáticas)
- [Estructura del proyecto](#estructura-del-proyecto)
- [Arquitectura y buenas prácticas](#arquitectura-y-buenas-prácticas)
- [Despliegue en Render (paso a paso)](#despliegue-en-render-paso-a-paso)
- [Variables de entorno](#variables-de-entorno)
- [Persistencia de datos](#persistencia-de-datos)
- [Reglas de negocio](#reglas-de-negocio)

---

## Funcionalidades

| # | Historia de usuario | Qué hace |
|---|---------------------|----------|
| **HU01** | Registro y formalización de préstamo con PIN | El empleado inicia sesión con su PIN, arma un "carrito de retiro" con uno o varios equipos, revisa el estado físico (solo lectura) y confirma reingresando su PIN. |
| **HU02** | Consulta de catálogo y estado de asignación | Catálogo en tarjetas agrupadas por categoría, con badge de disponibilidad y un resumen del estado físico. |
| **HU03** | Reporte de incidencias durante el préstamo | El empleado describe el problema en **texto libre**; el área de TIC lo clasifica (severidad, estado) después. |
| **HU04** | Devolución de equipo y checklist de recepción | Dos pasos: el empleado **solicita** la devolución; el Técnico/Admin **certifica la recepción** con un checklist real y editable. Si hay daño → el equipo pasa a *En Reparación* automáticamente. |
| **HU05** | Dashboard interactivo y vida útil | Panel para el Administrador: totales por estado, vida útil % promedio (calculada por fecha de adquisición), filtro por categoría, y lista de equipos cerca del fin de su vida útil. |
| **HU06** | Consulta y auditoría de bitácora de logs | Bitácora **inmutable** de todo lo que ocurre; el Administrador la consulta con filtros por fecha, usuario, acción y tipo de actor. Solo lectura. |
| **Extra** | Cierre de reparación | El Técnico/Admin marca un equipo *En Reparación* como reparado (vuelve al catálogo como *Disponible*) o lo da de *De Baja*. |

**Principio central del sistema:** el empleado **nunca** decide ni edita el estado
de un equipo. Solo describe y acepta. La clasificación de incidencias y el estado
físico de cada componente los mantiene exclusivamente el área de TIC.

---

## Stack tecnológico

| Capa | Tecnología |
|------|------------|
| Runtime | **Node.js 22.x** (usa el módulo nativo `node:sqlite`) |
| API | Express 4 (CommonJS) |
| Base de datos | SQLite en archivo, vía `node:sqlite` (`--experimental-sqlite`) |
| Autenticación | JWT (`jsonwebtoken`); contraseñas con `scrypt`, PIN con HMAC-SHA256 |
| Frontend | PWA vanilla: HTML + CSS + JavaScript, `manifest.json`, `service-worker.js` |
| Pruebas | `node --test` (runner nativo de Node) |

Dependencias de producción: solo **`express`** y **`jsonwebtoken`**.

---

## Requisitos previos

Necesitas **Node.js 22.x** y npm (viene con Node).

### Instalar Node 22

- **Windows / macOS / Linux con nvm** (recomendado):
  ```bash
  nvm install 22
  nvm use 22
  ```
  En Windows usa [nvm-windows](https://github.com/coreybutler/nvm-windows).
- **Sin nvm**: descarga el instalador de Node 22 LTS desde <https://nodejs.org>.

Verifica:
```bash
node --version   # debe mostrar v22.x
npm --version
```

> ⚠️ **Node 20 o inferior no sirve**: `node:sqlite` no existe antes de la 22.5.

---

## Instalación paso a paso (local)

```bash
# 1. Clonar el repositorio
git clone https://github.com/<TU-USUARIO>/<TU-REPO>.git
cd <TU-REPO>

# 2. Instalar dependencias
npm install

# 3. Crear el archivo de configuración local a partir del ejemplo
cp .env.example .env
#   Windows PowerShell:  Copy-Item .env.example .env
#   Para uso local no hace falta cambiar nada del .env.

# 4. Crear la base de datos con datos de demostración
npm run seed

# 5. Arrancar en modo desarrollo (se reinicia solo al guardar cambios)
npm run dev
```

Abre **http://localhost:3000** en el navegador.

Para arrancar sin modo desarrollo (como en producción):
```bash
npm start
```

---

## Credenciales de demostración

Después de `npm run seed` (o en el primer arranque, que siembra los datos solo):

| Perfil | Cómo entra |
|--------|-----------|
| **Empleado** | Solo PIN de 6 dígitos: `123456`, `234567` o `345678` |
| **Administrador** | Usuario `admin` / contraseña `Admin123*` |
| **Técnico** | Usuario `tecnico` / contraseña `Tecnico123*` |

---

## Cómo usar la aplicación

### Empleado

1. Entra en `/` e ingresa tu **PIN** (3 intentos fallidos → bloqueo de 15 min).
2. En el **catálogo**, selecciona los equipos que necesitas ("carrito de retiro").
3. Pulsa **"Revisar retiro"**, confirma la casilla y **reingresa tu PIN**.
4. Si tienes equipos prestados, arriba aparece un banner con dos acciones por equipo:
   - **"Reportar incidencia"** → describe el problema en texto libre.
   - **"Solicitar devolución"** → avisa a TIC que vas a devolverlo.

### Área de TIC (Administrador / Técnico)

1. En `/`, pulsa el enlace **"¿Eres del área de TIC? Inicia sesión aquí"** →
   `/staff.html` → usuario y contraseña.
2. En el **Panel de TIC** (`/panel.html`), pestañas:
   - **Devoluciones pendientes** → "Certificar recepción" (checklist real, RN04).
   - **Incidencias** → "Atender" (clasificar severidad, mover estado, notas).
   - **En reparación** → "Marcar como reparado" (vuelve al catálogo) o dar de baja.
   - **Dashboard** *(solo Administrador)* → indicadores y vida útil.
   - **Bitácora de auditoría** *(solo Administrador)* → historial con filtros, solo lectura.

---

## Scripts de npm

| Comando | Para qué |
|---------|----------|
| `npm run dev` | Servidor con recarga automática en `http://localhost:3000` |
| `npm start` | Servidor sin recarga (modo producción) |
| `npm run seed` | Borra y recrea la base de datos con los datos de demostración |
| `npm test` | Corre toda la suite de pruebas |

---

## Pruebas automáticas

```bash
npm test
```

**43 pruebas** que cubren las reglas de negocio (RN01–RN05, RNF01, RNF05),
la inmutabilidad de la bitácora (RN03), la autorización por rol, la vida útil,
y los flujos de retiro, devolución, incidencias y reparación.

Un solo archivo:
```bash
node --test --experimental-sqlite tests/flujoRetiro.test.js
```

---

## Estructura del proyecto

```
config/        configuración (variables de entorno), conexión a la BD, constantes
models/        una tabla por entidad + esquema.js (CREATE TABLE, triggers)
services/      TODA la lógica de negocio y las transacciones
controllers/   un archivo por recurso; solo orquesta (valida entrada, llama al service, responde)
routes/        un archivo por recurso; index.js las monta en /api
middlewares/   autenticación (JWT / PIN), límite de intentos, manejador de errores
utils/         errores, hashing, JWT, validación, helpers de estado
public/        la PWA (index.html, staff.html, catalogo.html, panel.html, css, js)
scripts/       seed.js (datos de demostración)
tests/         pruebas con node:test
app.js         arma la app de Express
servidor.js    inicializa la BD y pone a escuchar el servidor
render.yaml    Blueprint para desplegar en Render
```

---

## Arquitectura y buenas prácticas

El proyecto sigue una **arquitectura en capas** con responsabilidades separadas:

```
Petición HTTP
  → routes/        (define la URL y qué middlewares aplica)
  → middlewares/   (autenticación, autorización por rol, rate limit)
  → controllers/   (valida el body, llama al service, da forma a la respuesta)
  → services/      (reglas de negocio, transacciones — el "cerebro")
  → models/        (SQL puro, sin lógica)
  → base de datos
```

**Decisiones y prácticas aplicadas:**

- **Separación de responsabilidades (SRP):** un archivo = una responsabilidad.
  La lógica de negocio vive **solo** en `services/`; las rutas y los controllers
  no toman decisiones.
- **Manejo de errores centralizado y explícito:** cada método de controller va
  en `try/catch` y delega en un manejador único (`middlewares/errorHandler.js`)
  que responde `{ error: { codigo, mensaje } }` y **nunca** filtra un *stack
  trace* al cliente.
- **Errores de dominio como objetos tipados:** se lanza
  `new ErrorAplicacion(mensaje, codigoHttp, codigo)` (una **clase**) desde los
  services; el manejador la traduce a la respuesta HTTP.
- **Transacciones atómicas:** operaciones que tocan varias tablas (formalizar un
  retiro, certificar una devolución, cerrar una reparación) se ejecutan dentro de
  `enTransaccion(fn)` — o todo, o nada.
- **Seguridad:** contraseñas con `scrypt` + salt; el PIN se guarda como
  HMAC-SHA256 con *pepper* de servidor (nunca en claro); JWT con audiencias
  separadas para staff y empleados; bloqueo por IP tras 3 PIN fallidos;
  autorización por rol en cada endpoint sensible.
- **Inmutabilidad garantizada en la base de datos:** la bitácora de auditoría
  tiene *triggers* `BEFORE UPDATE / BEFORE DELETE` que abortan cualquier intento
  de modificarla, además de que el código nunca expone esas operaciones.
- **Nombres del dominio en español**, consistentes con el modelo entidad-relación.

**Sobre programación orientada a objetos:** en Node.js el estilo idiomático para
este tipo de servicio es el **patrón de módulo** (cada archivo encapsula su
estado y expone una interfaz), que es exactamente lo que se usa aquí, junto con
clases donde aportan (`ErrorAplicacion`, `class ErrorApi` en el cliente). El
resultado cumple los mismos principios que persigue la POO —encapsulamiento,
responsabilidad única, bajo acoplamiento, inversión de dependencias entre
capas— sin la ceremonia de instanciar clases sin estado. La POO clásica (una
clase por entidad) no es un requisito para escribir código mantenible y estos
principios ya se respetan.

---

## Despliegue en Render (paso a paso)

Ya hay un **`render.yaml`** en la raíz del repo, así que el despliegue es casi
automático.

### Opción A — con el Blueprint (recomendada)

1. Sube el proyecto a un repositorio de GitHub (ver más abajo).
2. Entra en <https://dashboard.render.com> → **New +** → **Blueprint**.
3. Conecta tu cuenta de GitHub y elige el repositorio.
4. Render lee `render.yaml`, muestra el servicio `inventario-tic` y **genera solo**
   los secretos `JWT_SECRET` y `PIN_PEPPER`. Pulsa **Apply**.
5. Espera a que termine el *build* (`npm ci`) y el *deploy* (`npm start`).
6. Abre la URL que te da Render. En el primer arranque la base se siembra sola con
   los datos de demostración.

### Opción B — servicio Web manual

1. **New +** → **Web Service** → conecta el repo.
2. Configura:
   - **Runtime:** Node
   - **Build Command:** `npm ci`
   - **Start Command:** `npm start`
   - **Health Check Path:** `/api/salud`
3. En **Environment**, añade las variables de la tabla de abajo.
4. **Create Web Service**.

### Subir el proyecto a GitHub

```bash
# dentro de la carpeta del proyecto, si aún no hay repo:
git init -b main
git add -A
git commit -m "Sistema de Inventario TIC"

# crea un repo VACÍO en github.com (sin README, sin .gitignore, sin licencia) y:
git remote add origin https://github.com/<TU-USUARIO>/<TU-REPO>.git
git push -u origin main
```

---

## Variables de entorno

En **local** se leen de `.env` (copia de `.env.example`). En un **hosting** se
configuran en el panel del servicio.

| Variable | ¿Obligatoria? | Descripción |
|----------|---------------|-------------|
| `ENTORNO` | Sí en producción | `produccion` activa la validación estricta de secretos (`NODE_ENV=production` también). |
| `JWT_SECRET` | **Sí en producción** | Cadena larga y aleatoria para firmar los JWT. El arranque **falla** si falta o tiene un valor de ejemplo. |
| `PIN_PEPPER` | **Sí en producción** | Cadena larga y aleatoria para el hash del PIN. Si cambia, los PIN existentes dejan de validar. |
| `PORT` | La pone el hosting | Puerto de escucha. En local se usa `PUERTO` o 3000. |
| `DB_RUTA` | No | Ruta del archivo `.db` (por defecto `./data/inventario.db`). |
| `SEMBRAR_DEMO` | No | `off` para **no** cargar datos de demostración cuando la BD arranca vacía. |
| `JWT_EXPIRACION_STAFF` / `JWT_EXPIRACION_EMPLEADO` | No | Vigencia de los tokens (`8h` / `20m` por defecto). |

Para generar un secreto seguro:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

---

## Persistencia de datos

La base de datos es **un archivo SQLite** (`data/inventario.db`).

- **En local:** los datos se guardan en ese archivo y persisten entre reinicios.
  Solo se borran si corres `npm run seed` de nuevo.
- **En Render (plan free):** el disco es **efímero**. El archivo se pierde cuando
  el servicio se duerme (tras ~15 min sin tráfico) o en cada *redeploy*. Al volver
  a arrancar, la aplicación **siembra los datos de demostración automáticamente**,
  así que siempre queda funcional, pero los préstamos/incidencias creados durante
  una sesión no sobreviven a un reinicio.
- **Para persistencia real en Render:** hay que usar un plan con **disco
  persistente** (de pago) y apuntar `DB_RUTA` al volumen. En `render.yaml` está el
  bloque `disk:` comentado y listo para activar.
- **Alternativa gratuita con persistencia:** migrar a una base de datos alojada
  (PostgreSQL, Turso). Es un cambio grande (toda la capa de datos pasaría a
  asíncrona) y no está incluido en esta versión.

---

## Reglas de negocio

| Regla | Qué garantiza |
|-------|---------------|
| **RN01** | Solo un equipo `Disponible` puede prestarse. Si un equipo del carrito no lo está, se rechaza **todo** el retiro. |
| **RN02** | Un retiro no es válido sin el checklist de salida **y** el reingreso del PIN del empleado. |
| **RN03** | Los registros de auditoría son inmutables (garantizado en código y con *triggers* de base de datos). |
| **RN04** | Una devolución con daño en el checklist **o** con una incidencia abierta manda el equipo a `En Reparación` automáticamente. |
| **RN05** | La vida útil % se calcula automáticamente por la fecha de adquisición (depreciación lineal, acotada a 0–100). |
| **RNF01** | El dashboard responde muy por debajo de los 2 s (consultas agregadas en SQL). |
| **RNF02** | La bitácora es estrictamente de solo lectura, sin controles de edición/borrado en la interfaz. |
| **RNF05** | 3 intentos fallidos de PIN bloquean el acceso 15 minutos. |

---

## Licencia

MIT.
