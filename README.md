# Sistema de Trazabilidad e Inventario TIC Multi-Sede

API REST (Node.js + Express + SQLite) + PWA offline-first para la gestion de
prestamos de equipos TIC con autenticacion por PIN.

> Arquitectura, reglas de negocio e historias de usuario: ver **[CLAUDE.md](./CLAUDE.md)**.

## Requisitos

- **Node.js >= 22.5.0** (usa el modulo nativo `node:sqlite`).
  Con `nvm-windows`: `nvm install 22.11.0 && nvm use 22.11.0`

## Puesta en marcha

```bash
cp .env.example .env      # PowerShell: Copy-Item .env.example .env
npm install
npm run seed              # DROP + CREATE + datos demo en data/inventario.db
npm run dev               # http://localhost:3000
```

## Credenciales demo

| Perfil   | Acceso |
|----------|--------|
| Empleado | Solo PIN: `123456`, `234567`, `345678` |
| Admin    | `admin` / `Admin123*` |
| Tecnico  | `tecnico` / `Tecnico123*` |

## Modelo del estado fisico

El estado fisico **por componente** de cada equipo (pantalla, teclado, cable,
lampara, ...) vive en `componente_equipo` y lo mantiene **el area de TIC**. El
Empleado nunca lo modifica: en el catalogo lo ve como un checklist de **solo
lectura** (verde = bueno, amarillo = regular, rojo = malo) y lo acepta con su PIN.

Los componentes validos dependen de la categoria del equipo
(`COMPONENTES_POR_CATEGORIA` en `config/constantes.js`).

## Flujo implementado (HU01 + HU02)

1. El empleado abre la PWA e ingresa su **PIN de 6 digitos** (`POST /api/auth/pin`).
   Tras 3 PIN incorrectos la IP queda bloqueada 15 minutos (RNF05).
2. Ve el **catalogo en tarjetas agrupadas por categoria**, cada una con badge de
   disponibilidad (verde/rojo) y badge de estado fisico (Buen estado / Con
   detalles / Con daños). "Ver estado" abre el checklist de componentes en solo
   lectura.
3. Selecciona **uno o varios equipos** ("carrito de retiro"), revisa el resumen
   combinado, marca *"Confirmo que recibo..."* y **reingresa su PIN** (RN02).
4. Se crea un `retiro` con N `prestamo` (`POST /api/retiros`), cada equipo pasa a
   `Prestado` (RN01) y queda constancia en la bitacora inmutable (RF07). Si algun
   equipo del carrito no esta disponible, se rechaza **todo** el retiro.

## Devolución (HU04) — dos pasos, dos pantallas

1. **El empleado solicita la devolución.** En `catalogo.html`, si tiene equipos
   prestados, aparece arriba de todo un banner **"Tienes N equipos prestados"**
   con un botón **"Solicitar devolución"** por equipo. No cierra el préstamo:
   solo lo pone en la cola y avisa a TIC.
2. **TIC certifica la recepción.** Desde la pantalla de ingreso, el enlace
   **"¿Eres del área de TIC? Inicia sesión aquí"** lleva a `staff.html`
   (usuario + contraseña). Tras entrar, `panel.html` muestra **"Devoluciones
   pendientes"** (las solicitadas primero). "Certificar recepción" abre un
   checklist **editable** de componentes; al registrarlo, si algún componente
   queda en `malo` o hay una incidencia abierta, el equipo pasa a
   `En Reparación` (RN04) y se actualiza `componente_equipo`.

## Cómo llegar a cada flujo

| Quiero... | Toco... |
|-----------|---------|
| Retirar equipos | `/` → PIN → tarjetas del catálogo → "Revisar retiro" → PIN |
| Devolver un equipo (empleado) | `/` → PIN → banner "Tienes N equipos prestados" → "Solicitar devolución" |
| Certificar una devolución (TIC) | `/` → "¿Eres del área de TIC? Inicia sesión aquí" → `staff.html` → `panel.html` → "Certificar recepción" |

## Endpoints

| Metodo | Ruta | Auth | HU |
|--------|------|------|-----|
| GET  | `/api/salud` | - | - |
| POST | `/api/auth/pin` | - (rate limit) | HU01 |
| POST | `/api/auth/login` | - | RF01 |
| GET  | `/api/catalogo` · `/api/catalogo/:id` | PIN o staff | HU02 |
| POST | `/api/retiros` | PIN | HU01 |
| GET  | `/api/retiros/mios` | PIN | HU02 |
| GET  | `/api/prestamos/mios-activos` | PIN | HU04 |
| POST | `/api/prestamos/:id/solicitar-devolucion` | PIN | HU04 |
| GET  | `/api/prestamos/pendientes` | staff | HU04 |
| POST | `/api/prestamos/:id/devolucion` | staff | HU04 |

## Tests

```bash
npm test
```

`tests/flujoRetiro.test.js` (13 casos): HU01 multi-equipo, RN01 (rechazo total),
RN02, "el empleado no fija el estado", RN04 con y sin daño, retiro parcial,
HU04 (solicitud del empleado, préstamo ajeno, orden de la cola de TIC),
RF07 (bitacora inmutable a nivel de BD), RNF05, validaciones de entrada.

## Pendiente

- `/api/equipos/:id/componentes` — edición directa del estado físico por TIC
- HU03 `/api/incidencias`, HU06 `/api/logs`, HU05 `/api/dashboard`
