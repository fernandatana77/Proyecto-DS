/* HU01 - captura del PIN de 6 digitos y login del empleado. */
(() => {
  const LONGITUD = 6;
  let pin = '';
  let enviando = false;

  const puntos = document.getElementById('pin-puntos');
  const aviso = document.getElementById('aviso');
  const teclado = document.getElementById('teclado');

  API.configurarLogin('/');

  // Si ya hay sesion de empleado, ir directo al catalogo.
  // (Si es sesion de staff, se ignora: aqui solo se entra con PIN.)
  const perfil = API.obtenerPerfil();
  if (API.obtenerToken() && perfil && !perfil.rol) {
    window.location.replace('/catalogo.html');
    return;
  }

  if (new URLSearchParams(location.search).get('expirado')) {
    mostrarAviso('Su sesion expiro. Ingrese el PIN nuevamente.', 'info');
  }

  function pintarPuntos() {
    puntos.querySelectorAll('.pin-punto').forEach((p, i) => {
      p.classList.toggle('lleno', i < pin.length);
    });
  }

  function mostrarAviso(texto, tipo = 'error') {
    aviso.textContent = texto;
    aviso.className = `aviso ${tipo}`;
    aviso.hidden = false;
  }

  function limpiarAviso() {
    aviso.hidden = true;
  }

  function reiniciarPin() {
    pin = '';
    pintarPuntos();
  }

  async function intentarLogin() {
    if (enviando) return;
    enviando = true;
    teclado.querySelectorAll('button').forEach((b) => (b.disabled = true));

    try {
      const { token, empleado } = await API.loginPin(pin);
      API.guardarSesion(token, empleado);
      window.location.replace('/catalogo.html');
    } catch (error) {
      puntos.classList.add('error');
      setTimeout(() => puntos.classList.remove('error'), 400);
      mostrarAviso(error.mensaje || 'No se pudo iniciar sesion.');
      reiniciarPin();
    } finally {
      enviando = false;
      teclado.querySelectorAll('button').forEach((b) => (b.disabled = false));
    }
  }

  function pulsar(tecla) {
    limpiarAviso();
    if (tecla === 'borrar') {
      pin = pin.slice(0, -1);
    } else if (tecla === 'limpiar') {
      pin = '';
    } else if (/^\d$/.test(tecla) && pin.length < LONGITUD) {
      pin += tecla;
    }
    pintarPuntos();
    if (pin.length === LONGITUD) intentarLogin();
  }

  teclado.addEventListener('click', (e) => {
    const boton = e.target.closest('button[data-tecla]');
    if (boton) pulsar(boton.dataset.tecla);
  });

  window.addEventListener('keydown', (e) => {
    if (/^\d$/.test(e.key)) pulsar(e.key);
    else if (e.key === 'Backspace') pulsar('borrar');
  });

  pintarPuntos();
})();
