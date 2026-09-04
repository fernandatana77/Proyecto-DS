/* Cliente HTTP de la PWA. Adjunta el token, normaliza errores y desloguea en 401. */
const API = (() => {
  const BASE = '/api';
  const CLAVE_TOKEN = 'inv_tic_token';
  const CLAVE_PERFIL = 'inv_tic_perfil';

  // A donde redirigir cuando la sesion caduca. Cada pantalla lo ajusta:
  // el catalogo del empleado -> '/', el panel de TIC -> '/staff.html'.
  let rutaLogin = '/';
  function configurarLogin(ruta) {
    rutaLogin = ruta;
  }

  function guardarSesion(token, perfil) {
    sessionStorage.setItem(CLAVE_TOKEN, token);
    sessionStorage.setItem(CLAVE_PERFIL, JSON.stringify(perfil || null));
  }

  function obtenerToken() {
    return sessionStorage.getItem(CLAVE_TOKEN);
  }

  /** Datos del empleado o del usuario staff que inicio sesion. */
  function obtenerPerfil() {
    try {
      return JSON.parse(sessionStorage.getItem(CLAVE_PERFIL));
    } catch {
      return null;
    }
  }

  function cerrarSesion() {
    sessionStorage.removeItem(CLAVE_TOKEN);
    sessionStorage.removeItem(CLAVE_PERFIL);
  }

  function exigirSesion() {
    if (!obtenerToken()) {
      window.location.replace(rutaLogin);
      throw new Error('Sin sesion');
    }
  }

  async function pedir(ruta, { metodo = 'GET', cuerpo, autenticado = true } = {}) {
    const cabeceras = { 'Content-Type': 'application/json' };
    if (autenticado && obtenerToken()) {
      cabeceras.Authorization = `Bearer ${obtenerToken()}`;
    }

    let respuesta;
    try {
      respuesta = await fetch(BASE + ruta, {
        method: metodo,
        headers: cabeceras,
        body: cuerpo ? JSON.stringify(cuerpo) : undefined,
      });
    } catch {
      throw new ErrorApi('Sin conexion con el servidor.', 0, 'SIN_CONEXION');
    }

    let datos = null;
    try {
      datos = await respuesta.json();
    } catch {
      /* respuesta sin cuerpo */
    }

    if (!respuesta.ok) {
      const err = datos?.error || {};
      if (respuesta.status === 401 && autenticado) {
        cerrarSesion();
        window.location.replace(`${rutaLogin}${rutaLogin.includes('?') ? '&' : '?'}expirado=1`);
      }
      throw new ErrorApi(err.mensaje || 'Error inesperado.', respuesta.status, err.codigo);
    }
    return datos;
  }

  class ErrorApi extends Error {
    constructor(mensaje, estado, codigo) {
      super(mensaje);
      this.name = 'ErrorApi';
      this.mensaje = mensaje; // alias en espanol usado por las vistas
      this.estado = estado;
      this.codigo = codigo;
    }
  }

  return {
    ErrorApi,
    configurarLogin,
    guardarSesion,
    obtenerPerfil,
    obtenerToken,
    cerrarSesion,
    exigirSesion,

    // --- Empleado (PIN) ---
    loginPin: (pin) => pedir('/auth/pin', { metodo: 'POST', cuerpo: { pin }, autenticado: false }),
    catalogo: (params = '') => pedir(`/catalogo${params}`),
    equipo: (id) => pedir(`/catalogo/${id}`),
    registrarRetiro: (payload) => pedir('/retiros', { metodo: 'POST', cuerpo: payload }),
    misRetiros: () => pedir('/retiros/mios'),
    misPrestamosActivos: () => pedir('/prestamos/mios-activos'),
    solicitarDevolucion: (prestamoId) =>
      pedir(`/prestamos/${prestamoId}/solicitar-devolucion`, { metodo: 'POST' }),
    reportarIncidencia: (prestamoId, descripcion) =>
      pedir('/incidencias', { metodo: 'POST', cuerpo: { prestamoId, descripcion } }),
    misIncidencias: () => pedir('/incidencias/mias'),

    // --- Staff Admin / Tecnico (usuario + contrasena) ---
    loginStaff: (usuario, password) =>
      pedir('/auth/login', { metodo: 'POST', cuerpo: { usuario, password }, autenticado: false }),
    devolucionesPendientes: () => pedir('/prestamos/pendientes'),
    certificarDevolucion: (prestamoId, checklist) =>
      pedir(`/prestamos/${prestamoId}/devolucion`, { metodo: 'POST', cuerpo: { checklist } }),
    incidencias: (params = '') => pedir(`/incidencias${params}`),
    triarIncidencia: (id, cambios) =>
      pedir(`/incidencias/${id}`, { metodo: 'PATCH', cuerpo: cambios }),

    // --- Bitácora (HU06, solo Admin, solo lectura) ---
    bitacora: (params = '') => pedir(`/logs${params}`),
    accionesBitacora: () => pedir('/logs/acciones'),

    // --- Dashboard (HU05, solo Admin) ---
    dashboard: (params = '') => pedir(`/dashboard${params}`),
  };
})();
