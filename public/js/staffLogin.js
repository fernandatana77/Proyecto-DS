/* RF01 - login de Admin / Tecnico con usuario + contrasena. */
(() => {
  API.configurarLogin('/staff.html');

  // Si ya hay sesion staff, ir al panel.
  if (API.obtenerToken() && API.obtenerPerfil()?.rol) {
    window.location.replace('/panel.html');
    return;
  }

  const form = document.getElementById('form-staff');
  const aviso = document.getElementById('aviso');
  const boton = document.getElementById('btn-ingresar');

  if (new URLSearchParams(location.search).get('expirado')) {
    aviso.textContent = 'Su sesion expiro. Vuelva a ingresar.';
    aviso.className = 'aviso info';
    aviso.hidden = false;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    aviso.hidden = true;
    boton.disabled = true;
    boton.textContent = 'Ingresando...';

    try {
      const usuario = form.usuario.value.trim();
      const password = form.password.value;
      const { token, usuario: perfil } = await API.loginStaff(usuario, password);
      API.guardarSesion(token, perfil);
      window.location.replace('/panel.html');
    } catch (error) {
      aviso.textContent = error.mensaje || 'No se pudo iniciar sesion.';
      aviso.className = 'aviso error';
      aviso.hidden = false;
      boton.disabled = false;
      boton.textContent = 'Ingresar';
    }
  });
})();
