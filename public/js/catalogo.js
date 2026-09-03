/* HU02 + HU01 - catalogo en tarjetas por categoria, carrito de retiro y
   formalizacion con PIN. El estado fisico se muestra SOLO LECTURA. */
(() => {
  API.exigirSesion();

  API.configurarLogin('/');
  const $ = (id) => document.getElementById(id);
  const empleado = API.obtenerPerfil();

  const tabsEl = $('tabs');
  const contenidoEl = $('contenido');
  const vacioEl = $('vacio');
  const avisoGlobal = $('aviso-global');

  const barraCarrito = $('barra-carrito');
  const carritoConteo = $('carrito-conteo');

  const modalEstado = $('modal-estado');
  const modalRetiro = $('modal-retiro');
  const retiroAviso = $('retiro-aviso');
  const retiroItems = $('retiro-items');
  const retiroConfirmo = $('retiro-confirmo');
  const retiroPin = $('retiro-pin');
  const btnConfirmarRetiro = $('btn-confirmar-retiro');

  let equipos = [];
  let categoriaActiva = 'Todos';
  const carrito = new Map(); // id -> equipo
  let enviando = false;

  const ESTADO_ETIQUETA = { bueno: 'Bueno', regular: 'Regular', malo: 'Malo' };

  if (empleado) {
    $('saludo-empleado').textContent = `${empleado.nombres} ${empleado.apellidos} · ${empleado.sede}`;
  }
  $('btn-salir').addEventListener('click', () => {
    API.cerrarSesion();
    window.location.replace('/');
  });

  // ---------- utilidades de render ----------
  function el(tag, clase, texto) {
    const nodo = document.createElement(tag);
    if (clase) nodo.className = clase;
    if (texto != null) nodo.textContent = texto;
    return nodo;
  }

  function badgeDisponibilidad(equipo) {
    const b = el('span', 'badge');
    if (equipo.estado === 'Disponible') {
      b.className = 'badge badge-ok';
      b.innerHTML = '<span class="punto"></span>Disponible';
    } else if (equipo.estado === 'En Reparación') {
      b.className = 'badge badge-bad';
      b.innerHTML = '<span class="punto"></span>En reparacion';
    } else if (equipo.estado === 'Prestado') {
      b.className = 'badge badge-warn';
      b.innerHTML = '<span class="punto"></span>Prestado';
    } else {
      b.className = 'badge badge-neutro';
      b.innerHTML = `<span class="punto"></span>${equipo.estado}`;
    }
    return b;
  }

  function badgeEstadoFisico(resumen) {
    const clase = { bueno: 'badge-ok', detalles: 'badge-warn', danos: 'badge-bad' }[resumen.nivel] || 'badge-neutro';
    const b = el('span', `badge ${clase}`);
    b.textContent = resumen.etiqueta;
    return b;
  }

  /** Checklist de componentes en SOLO LECTURA (verde/amarillo/rojo, sin botones). */
  function renderChecklistLectura(componentes) {
    const cont = el('div', 'checklist-lectura');
    componentes.forEach((c) => {
      const fila = el('div', 'checklist-fila');
      fila.appendChild(el('span', `luz ${c.estado}`));

      const comp = el('span', 'comp');
      comp.textContent = c.nombre.replace(/_/g, ' ');
      if (c.observacion) comp.appendChild(el('span', 'nota', c.observacion));
      fila.appendChild(comp);

      fila.appendChild(el('span', `val ${c.estado}`, ESTADO_ETIQUETA[c.estado] || c.estado));
      cont.appendChild(fila);
    });
    return cont;
  }

  // ---------- tarjeta de equipo ----------
  function tarjetaEquipo(equipo) {
    const tarjeta = el('div', 'tarjeta');
    const seleccionable = equipo.disponibleParaPrestamo;
    if (seleccionable) tarjeta.classList.add('seleccionable');
    if (carrito.has(equipo.id)) tarjeta.classList.add('seleccionada');

    const top = el('div', 'tarjeta-top');
    const icono = el('div', 'tarjeta-icono');
    icono.innerHTML = iconoDeCategoria(equipo.categoria);
    top.appendChild(icono);
    top.appendChild(badgeDisponibilidad(equipo));
    tarjeta.appendChild(top);

    const cuerpo = el('div');
    cuerpo.appendChild(el('div', 'tarjeta-codigo', equipo.codigoInterno));
    cuerpo.appendChild(el('div', 'tarjeta-nombre', equipo.nombre));
    cuerpo.appendChild(el('div', 'tarjeta-categoria', `${equipo.categoria}${equipo.marca ? ' · ' + equipo.marca : ''}`));
    tarjeta.appendChild(cuerpo);

    const badges = el('div', 'tarjeta-badges');
    badges.appendChild(badgeEstadoFisico(equipo.resumenEstado));
    tarjeta.appendChild(badges);

    const pie = el('div', 'tarjeta-pie');
    if (seleccionable) {
      const check = el('span', 'check-sel');
      check.innerHTML =
        '<span class="caja"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg></span>' +
        `<span>${carrito.has(equipo.id) ? 'Agregado' : 'Agregar al retiro'}</span>`;
      pie.appendChild(check);
    } else {
      pie.appendChild(el('span', 'tarjeta-categoria', 'No disponible'));
    }
    const verEstado = el('button', 'btn-texto', 'Ver estado');
    verEstado.addEventListener('click', (e) => {
      e.stopPropagation();
      abrirModalEstado(equipo);
    });
    pie.appendChild(verEstado);
    tarjeta.appendChild(pie);

    if (seleccionable) {
      tarjeta.addEventListener('click', () => alternarCarrito(equipo));
    }
    return tarjeta;
  }

  // ---------- render principal ----------
  function categoriasDisponibles() {
    return [...new Set(equipos.map((e) => e.categoria))].sort();
  }

  function renderTabs() {
    tabsEl.innerHTML = '';
    ['Todos', ...categoriasDisponibles()].forEach((cat) => {
      const tab = el('button', 'tab' + (cat === categoriaActiva ? ' activo' : ''), cat);
      tab.addEventListener('click', () => {
        categoriaActiva = cat;
        renderTabs();
        renderContenido();
      });
      tabsEl.appendChild(tab);
    });
  }

  function renderGrupo(categoria, lista) {
    const grupo = el('div', 'grupo-categoria');
    grupo.appendChild(el('h2', null, `${categoria} (${lista.length})`));
    const grilla = el('div', 'grilla');
    lista.forEach((eq) => grilla.appendChild(tarjetaEquipo(eq)));
    grupo.appendChild(grilla);
    return grupo;
  }

  function renderContenido() {
    contenidoEl.innerHTML = '';
    const visibles = categoriaActiva === 'Todos' ? equipos : equipos.filter((e) => e.categoria === categoriaActiva);
    vacioEl.hidden = visibles.length > 0;

    const categorias = categoriaActiva === 'Todos' ? categoriasDisponibles() : [categoriaActiva];
    categorias.forEach((cat) => {
      const lista = visibles.filter((e) => e.categoria === cat);
      if (lista.length) contenidoEl.appendChild(renderGrupo(cat, lista));
    });
  }

  // ---------- carrito ----------
  function alternarCarrito(equipo) {
    if (carrito.has(equipo.id)) carrito.delete(equipo.id);
    else carrito.set(equipo.id, equipo);
    renderContenido();
    renderBarraCarrito();
  }

  function renderBarraCarrito() {
    const n = carrito.size;
    barraCarrito.hidden = n === 0;
    if (n > 0) {
      carritoConteo.innerHTML = `${n} equipo${n > 1 ? 's' : ''} <span>seleccionado${n > 1 ? 's' : ''}</span>`;
    }
  }

  // ---------- modal: estado de un equipo ----------
  function abrirModalEstado(equipo) {
    $('estado-titulo').textContent = equipo.nombre;
    $('estado-subtitulo').textContent = `${equipo.codigoInterno} · ${equipo.categoria} · Estado registrado por TIC`;
    const cont = $('estado-checklist');
    cont.innerHTML = '';
    cont.appendChild(renderChecklistLectura(equipo.componentes || []));
    modalEstado.hidden = false;
  }
  $('btn-cerrar-estado').addEventListener('click', () => (modalEstado.hidden = true));
  modalEstado.addEventListener('click', (e) => {
    if (e.target === modalEstado) modalEstado.hidden = true;
  });

  // ---------- modal: retiro ----------
  function abrirModalRetiro() {
    if (carrito.size === 0) return;
    retiroAviso.hidden = true;
    retiroConfirmo.checked = false;
    retiroPin.value = '';
    actualizarBotonConfirmar();
    $('retiro-paso-resumen').hidden = false;
    $('retiro-paso-ok').hidden = true;

    const items = [...carrito.values()];
    $('retiro-subtitulo').textContent =
      `${items.length} equipo${items.length > 1 ? 's' : ''} · revise el estado y acepte con su PIN (RN02).`;

    retiroItems.innerHTML = '';
    items.forEach((eq) => {
      const item = el('div', 'item-retiro');
      const cab = el('div', 'item-retiro-cab');
      cab.innerHTML =
        `<span class="t">${eq.nombre}</span><span class="c">${eq.codigoInterno}</span>`;
      const cuerpo = el('div', 'item-retiro-cuerpo');
      cuerpo.hidden = true;
      cuerpo.appendChild(renderChecklistLectura(eq.componentes || []));
      cab.addEventListener('click', () => (cuerpo.hidden = !cuerpo.hidden));
      item.append(cab, cuerpo);
      retiroItems.appendChild(item);
    });

    modalRetiro.hidden = false;
  }

  function cerrarModalRetiro() {
    modalRetiro.hidden = true;
  }

  function actualizarBotonConfirmar() {
    btnConfirmarRetiro.disabled = !(retiroConfirmo.checked && /^\d{6}$/.test(retiroPin.value));
  }

  retiroConfirmo.addEventListener('change', actualizarBotonConfirmar);
  retiroPin.addEventListener('input', () => {
    retiroPin.value = retiroPin.value.replace(/\D/g, '').slice(0, 6);
    actualizarBotonConfirmar();
  });

  $('btn-revisar').addEventListener('click', abrirModalRetiro);
  $('btn-cancelar-retiro').addEventListener('click', cerrarModalRetiro);
  modalRetiro.addEventListener('click', (e) => {
    if (e.target === modalRetiro) cerrarModalRetiro();
  });

  $('btn-confirmar-retiro').addEventListener('click', async () => {
    if (enviando) return;
    enviando = true;
    btnConfirmarRetiro.disabled = true;
    retiroAviso.hidden = true;

    try {
      const respuesta = await API.registrarRetiro({
        equipoIds: [...carrito.keys()],
        pin: retiroPin.value,
      });
      $('retiro-texto-ok').textContent =
        `Retiro #${respuesta.retiro.id} registrado. ` +
        respuesta.equipos.map((e) => `${e.codigoInterno} (${e.estado})`).join(', ') + '.';
      $('retiro-paso-resumen').hidden = true;
      $('retiro-paso-ok').hidden = false;
      carrito.clear();
    } catch (error) {
      retiroAviso.textContent = error.mensaje || 'No se pudo registrar el retiro.';
      retiroAviso.hidden = false;
    } finally {
      enviando = false;
      actualizarBotonConfirmar();
    }
  });

  $('btn-cerrar-ok').addEventListener('click', () => {
    cerrarModalRetiro();
    renderBarraCarrito();
    cargarCatalogo();
    cargarMisPrestamos();
  });

  // ---------- HU04 + HU03: mis equipos prestados ----------
  const seccionPrestamos = $('mis-prestamos');
  const listaPrestamos = $('mis-prestamos-lista');

  function filaPrestamo(p) {
    const fila = el('div', 'mi-prestamo');

    const info = el('div', 'mi-prestamo-info');
    info.appendChild(el('div', 'tarjeta-nombre', p.equipoNombre));
    info.appendChild(el('div', 'tarjeta-codigo', `${p.equipoCodigo} · ${p.categoria}`));
    if (p.incidenciasAbiertas > 0) {
      const badge = el('span', 'badge badge-warn');
      badge.style.marginTop = '4px';
      badge.innerHTML =
        `<span class="punto"></span>${p.incidenciasAbiertas} incidencia${p.incidenciasAbiertas > 1 ? 's' : ''} en revisión`;
      info.appendChild(badge);
    }

    const accion = el('div', 'mi-prestamo-accion');

    const btnInc = el('button', 'btn btn-secundario', 'Reportar incidencia');
    btnInc.addEventListener('click', () => abrirModalIncidencia(p));
    accion.appendChild(btnInc);

    if (p.devolucionSolicitada) {
      const badge = el('span', 'badge badge-ok');
      badge.innerHTML = '<span class="punto"></span>Devolución solicitada';
      accion.appendChild(badge);
    } else {
      const boton = el('button', 'btn btn-primario', 'Solicitar devolución');
      boton.addEventListener('click', async () => {
        boton.disabled = true;
        boton.textContent = 'Enviando...';
        try {
          await API.solicitarDevolucion(p.prestamoId);
          cargarMisPrestamos();
        } catch (error) {
          boton.disabled = false;
          boton.textContent = 'Solicitar devolución';
          avisoGlobal.textContent = error.mensaje || 'No se pudo solicitar la devolución.';
          avisoGlobal.className = 'aviso error';
          avisoGlobal.hidden = false;
        }
      });
      accion.appendChild(boton);
    }

    fila.append(info, accion);
    return fila;
  }

  // ---------- HU03: modal de reporte de incidencia ----------
  const modalInc = $('modal-incidencia');
  const incDescripcion = $('inc-descripcion');
  const incAviso = $('inc-aviso');
  let prestamoIncidencia = null;
  let enviandoInc = false;

  function abrirModalIncidencia(p) {
    prestamoIncidencia = p;
    incAviso.hidden = true;
    incDescripcion.value = '';
    $('inc-paso-form').hidden = false;
    $('inc-paso-ok').hidden = true;
    $('inc-subtitulo').textContent = `${p.equipoNombre} · ${p.equipoCodigo}`;
    modalInc.hidden = false;
    incDescripcion.focus();
  }

  function cerrarModalIncidencia() {
    modalInc.hidden = true;
    prestamoIncidencia = null;
  }

  $('btn-cancelar-inc').addEventListener('click', cerrarModalIncidencia);
  modalInc.addEventListener('click', (e) => {
    if (e.target === modalInc) cerrarModalIncidencia();
  });
  $('btn-cerrar-inc-ok').addEventListener('click', () => {
    cerrarModalIncidencia();
    cargarMisPrestamos();
  });

  $('btn-enviar-inc').addEventListener('click', async () => {
    if (enviandoInc || !prestamoIncidencia) return;
    const texto = incDescripcion.value.trim();
    if (texto.length < 5) {
      incAviso.textContent = 'Describe el problema con un poco más de detalle.';
      incAviso.hidden = false;
      return;
    }
    enviandoInc = true;
    $('btn-enviar-inc').disabled = true;
    incAviso.hidden = true;
    try {
      const respuesta = await API.reportarIncidencia(prestamoIncidencia.prestamoId, texto);
      $('inc-texto-ok').textContent = respuesta.mensaje;
      $('inc-paso-form').hidden = true;
      $('inc-paso-ok').hidden = false;
    } catch (error) {
      incAviso.textContent = error.mensaje || 'No se pudo reportar la incidencia.';
      incAviso.hidden = false;
    } finally {
      enviandoInc = false;
      $('btn-enviar-inc').disabled = false;
    }
  });

  async function cargarMisPrestamos() {
    try {
      const { prestamos } = await API.misPrestamosActivos();
      seccionPrestamos.hidden = prestamos.length === 0;
      if (prestamos.length) {
        $('mis-prestamos-titulo').textContent =
          `Tienes ${prestamos.length} equipo${prestamos.length > 1 ? 's' : ''} prestado${prestamos.length > 1 ? 's' : ''}`;
        listaPrestamos.innerHTML = '';
        prestamos.forEach((p) => listaPrestamos.appendChild(filaPrestamo(p)));
      }
    } catch {
      seccionPrestamos.hidden = true;
    }
  }

  // ---------- carga ----------
  async function cargarCatalogo() {
    avisoGlobal.hidden = true;
    contenidoEl.innerHTML = '<p class="vacio">Cargando catalogo...</p>';
    try {
      const datos = await API.catalogo();
      equipos = datos.equipos;
      // limpiar del carrito lo que ya no este disponible
      for (const id of [...carrito.keys()]) {
        const actual = equipos.find((e) => e.id === id);
        if (!actual || !actual.disponibleParaPrestamo) carrito.delete(id);
        else carrito.set(id, actual);
      }
      renderTabs();
      renderContenido();
      renderBarraCarrito();
    } catch (error) {
      contenidoEl.innerHTML = '';
      avisoGlobal.textContent = error.mensaje || 'No se pudo cargar el catalogo.';
      avisoGlobal.className = 'aviso error';
      avisoGlobal.hidden = false;
    }
  }

  cargarCatalogo();
  cargarMisPrestamos();
})();
