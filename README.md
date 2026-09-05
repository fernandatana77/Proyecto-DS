# Sistema de Trazabilidad e Inventario TIC Multi-Sede

**Proyecto Integrador**  
**Estudiante:** Fernanda Tana  
**Asignatura:** Diseño de Software  
**Fecha:** 04 de Septiembre 2026  

---

## 🚀 Enlaces Principales del Proyecto

* **Repositorio de Código Fuente (GitHub):** [https://github.com/fernandatana77/Proyecto-DS](https://github.com/fernandatana77/Proyecto-DS)
* **Aplicación Desplegada en Producción (Render):** [https://inventario-tic-ozw6.onrender.com](https://inventario-tic-ozw6.onrender.com)

---

## 📋 Resumen del Proyecto Integrador (Tareas 1 a 4)

### 🔹 Tarea 1: Comprensión del Problema y Requerimientos
* **Problemática:** Levantamiento del problema de falta de control, pérdida de trazabilidad e historial ineficiente de equipos informáticos en múltiples sedes.
* **Solución Propuesta:** Sistema web centralizado con autenticación basada en roles:
  * **Empleados:** Consulta rápida de activos asignados mediante un PIN de 6 dígitos.
  * **Personal TIC / Administradores:** Gestión de altas, bajas, movimientos entre sedes y mantenimientos preventivos/correctivos con logs inmutables.

---

### 🔹 Tarea 2: Diseño de Software y Arquitectura
* **Patrón de Arquitectura:** Layered Architecture / MVC adaptado a REST API.
* **Diseño Orientado a Objetos:** Elaboración de diagramas UML (Casos de Uso, Diagrama de Clases) y Modelo Entidad-Relación de la base de datos relacional.
* **Prototipado UI/UX:** Diseño de pantallas responsivas enfocadas en usabilidad y velocidad de interacción.

---

### 🔹 Tarea 3: Desarrollo, Repositorio y Despliegue en la Nube
* **Stack Tecnológico:**
  * **Frontend:** HTML5, CSS3, JavaScript Vanilla (PWA - Progressive Web App).
  * **Backend:** Node.js (v22/v24), Express.js.
  * **Base de Datos:** SQLite nativo (`inventario.db`).
* **Infraestructura como Código (IaC):** Configuración del archivo `render.yaml` (Blueprint).
* **Despliegue Continuo:** Aplicación publicada y funcional en la nube a través de Render.

---

### 🔹 Tarea 4: Suite de Pruebas Automatizadas y Aseguramiento de Calidad
* **Pruebas Automatizadas:** Implementación de suite de pruebas unitarias e integración con el runner nativo de Node.js.
* **Cobertura:** Validación de endpoints REST API, autenticación por PIN, login de personal staff y consistencia en transacciones de inventario.
* **Resultado de Pruebas:** **43 / 43 pruebas pasadas con éxito (0 fallos).**

---

### Perfil
Empleado:	Solo PIN de 6 dígitos: 123456, 234567 o 345678
Administrador:	Usuario admin / contraseña Admin123*
Técnico:	Usuario tecnico / contraseña Tecnico123*

