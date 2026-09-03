/* HU04 paso 2 - Panel de TIC: cola de devoluciones y certificación de recepción. */
(() => {
  API.configurarLogin('/staff.html');
  API.exigirSesion();

  const perfil = API.obtenerPerfil();
  if (!perfil || !perfil.rol) {
    window.location.replace('/staff.html');
    return;
  }

  const $ = (id) => document.getElementById(id);
  const ESTADOS = [
    { valor: 'bueno', etiqueta: 'Bueno' },
    { valor: 'regular', etiqueta: 'Regular' },
    { valor: 'malo', etiqueta: 'Malo' },
  ];

  const listaEl = $('lista-pendientes');
  const vacioEl = $('vacio');
  const avisoGlobal = $('aviso-global');
  const contador = $('contador-pendientes');

  const modal = $('modal-cert');
  const certChecklist = $('cert-checklist');
  const certObs = $('cert-obs');
  const certAviso = $('cert-aviso');

  let seleccion = null; // { prestamoId, equipoId, equipoNombre }
  let estadoComponentes = {}; // nombre -> 'bueno'|'regular'|'malo'
  let enviando = false;

  $('saludo-staff').textContent = `${perfil.usuario} · ${perfil.rol}`;
  $('btn-salir').addEventListener('click', () => {
    API.cerrarSesion();
    window.location.replace('/staff.html');
  });

  function el(tag, clase, texto) {
    const n = document.createElement(tag);
    if (clase) n.className = clase;
    if (texto != null) n.textContent = texto;
    return n;
  }

  // ---------- lista de pendientes ----------
  function tarjetaPendiente(p) {
    const card = el('div', 'tarjeta-pendiente');

    const icono = el('div', 'tarjeta-icono');
    icono.innerHTML = iconoDeCategoria(p.categoria);

    const info = el('div', 'pendiente-info');
    info.appendChild(el('div', 'tarjeta-codigo', `${p.equipoCodigo} · ${p.categoria}`));
    info.appendChild(el('div', 'tarjeta-nombre', p.equipoNombre));
    info.appendChild(el('div', 'tarjeta-categoria', `${p.empleadoNombre} · ${p.empleadoSede || ''}`));

    const badge = el('span', 'badge');
    if (p.devolucionSolicitada) {
      badge.className = 'badge badge-warn';
      badge.innerHTML = '<span class="punto"></span>Solicitada por el empleado';
    } else {
      badge.className = 'badge badge-neutro';
      badge.innerHTML = '<span class="punto"></span>Aún en poder del empleado';
    }
    info.appendChild(badge);

    const boton = el('button', 'btn btn-primario', 'Certificar recepción');
    boton.addEventListener('click', () => abrirModal(p));

    const izq = el('div', 'pendiente-izq');
    izq.append(icono, info);
    card.append(izq, boton);
    return card;
  }

  async function cargar() {
    avisoGlobal.hidden = true;
    listaEl.innerHTML = '<p class="vacio">Cargando...</p>';
    try {
      const { prestamos } = await API.devolucionesPendientes();
      listaEl.innerHTML = '';
      contador.textContent = prestamos.length ? `(${prestamos.length})` : '';
      vacioEl.hidden = prestamos.length > 0;
      prestamos.forEach((p) => listaEl.appendChild(tarjetaPendiente(p)));
    } catch (error) {
      listaEl.innerHTML = '';
      avisoGlobal.textContent = error.mensaje || 'No se pudo cargar la lista.';
      avisoGlobal.className = 'aviso error';
      avisoGlobal.hidden = false;
    }
  }

  // ---------- checklist editable ----------
  function filaEditable(comp) {
    const fila = el('div', 'check-editable');
    const etiqueta = el('div', 'check-editable-nombre');
    etiqueta.textContent = comp.nombre.replace(/_/g, ' ');
    if (comp.observacion) etiqueta.appendChild(el('span', 'nota', `Registrado: ${comp.observacion}`));

    const opciones = el('div', 'opciones-estado');
    ESTADOS.forEach(({ valor, etiqueta: txt }) => {
      const b = el('button', 'opcion', txt);
      b.type = 'button';
      if (estadoComponentes[comp.nombre] === valor) b.classList.add(`sel-${valor}`);
      b.addEventListener('click', () => {
        estadoComponentes[comp.nombre] = valor;
        opciones.querySelectorAll('button').forEach((x) => x.classList.remove('sel-bueno', 'sel-regular', 'sel-malo'));
        b.classList.add(`sel-${valor}`);
      });
      opciones.appendChild(b);
    });

    fila.append(etiqueta, opciones);
    return fila;
  }

  async function abrirModal(p) {
    seleccion = p;
    certAviso.hidden = true;
    certObs.value = '';
    $('cert-paso-form').hidden = false;
    $('cert-paso-ok').hidden = true;
    $('cert-titulo').textContent = `Certificar: ${p.equipoNombre}`;
    $('cert-subtitulo').textContent = `${p.equipoCodigo} · prestado a ${p.empleadoNombre}`;
    certChecklist.innerHTML = '<p class="vacio">Cargando estado del equipo...</p>';
    modal.hidden = false;

    try {
      const detalle = await API.equipo(p.equipoId);
      estadoComponentes = {};
      detalle.componentes.forEach((c) => {
        estadoComponentes[c.nombre] = c.estado;
      });
      certChecklist.innerHTML = '';
      detalle.componentes.forEach((c) => certChecklist.appendChild(filaEditable(c)));
    } catch (error) {
      certChecklist.innerHTML = '';
      certAviso.textContent = error.mensaje || 'No se pudo cargar el estado del equipo.';
      certAviso.hidden = false;
    }
  }

  function cerrarModal() {
    modal.hidden = true;
    seleccion = null;
  }

  $('btn-cancelar-cert').addEventListener('click', cerrarModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) cerrarModal();
  });
  $('btn-cerrar-cert-ok').addEventListener('click', () => {
    cerrarModal();
    cargar();
  });

  $('btn-registrar-cert').addEventListener('click', async () => {
    if (enviando || !seleccion) return;
    enviando = true;
    $('btn-registrar-cert').disabled = true;
    certAviso.hidden = true;

    try {
      const respuesta = await API.certificarDevolucion(seleccion.prestamoId, {
        items: estadoComponentes,
        observaciones: certObs.value.trim(),
      });
      $('cert-texto-ok').textContent = respuesta.mensaje +
        ` Equipo ${seleccion.equipoNombre} → estado "${respuesta.equipo.estado}".`;
      $('cert-paso-form').hidden = true;
      $('cert-paso-ok').hidden = false;
    } catch (error) {
      certAviso.textContent = error.mensaje || 'No se pudo registrar la devolución.';
      certAviso.hidden = false;
    } finally {
      enviando = false;
      $('btn-registrar-cert').disabled = false;
    }
  });

  cargar();
})();
