/* Panel de TIC: HU04 (cola de devoluciones + certificación) y HU03 (incidencias). */
(() => {
  API.configurarLogin('/staff.html');
  API.exigirSesion();

  const perfil = API.obtenerPerfil();
  if (!perfil || !perfil.rol) {
    window.location.replace('/staff.html');
    return;
  }

  const $ = (id) => document.getElementById(id);
  const COMPONENTE_ESTADOS = [
    { valor: 'bueno', etiqueta: 'Bueno' },
    { valor: 'regular', etiqueta: 'Regular' },
    { valor: 'malo', etiqueta: 'Malo' },
  ];
  const SEVERIDAD_CLASE = {
    'sin clasificar': 'badge-neutro',
    baja: 'badge-ok',
    media: 'badge-warn',
    alta: 'badge-bad',
  };
  const ESTADO_INC_CLASE = { Abierta: 'badge-warn', 'En proceso': 'badge-info', Cerrada: 'badge-neutro' };

  const avisoGlobal = $('aviso-global');
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
  function badge(clase, texto, capitalizar) {
    const b = el('span', `badge ${clase}${capitalizar ? ' cap' : ''}`);
    b.innerHTML = '<span class="punto"></span>';
    b.appendChild(document.createTextNode(texto));
    return b;
  }
  function mostrarError(mensaje) {
    avisoGlobal.textContent = mensaje;
    avisoGlobal.className = 'aviso error';
    avisoGlobal.hidden = false;
  }

  // ===================== Tabs =====================
  $('tabs-panel').addEventListener('click', (e) => {
    const tab = e.target.closest('.tab');
    if (!tab) return;
    $('tabs-panel').querySelectorAll('.tab').forEach((t) => t.classList.remove('activo'));
    tab.classList.add('activo');
    const vista = tab.dataset.vista;
    $('vista-devoluciones').hidden = vista !== 'devoluciones';
    $('vista-incidencias').hidden = vista !== 'incidencias';
    if (vista === 'incidencias') cargarIncidencias();
  });

  // ===================== HU04: devoluciones =====================
  const listaPend = $('lista-pendientes');
  const vacioDev = $('vacio-dev');

  const modalCert = $('modal-cert');
  const certChecklist = $('cert-checklist');
  const certObs = $('cert-obs');
  const certAviso = $('cert-aviso');
  const certIncidencias = $('cert-incidencias');
  let certSeleccion = null;
  let estadoComponentes = {};

  function tarjetaPendiente(p) {
    const card = el('div', 'tarjeta-pendiente');
    const icono = el('div', 'tarjeta-icono');
    icono.innerHTML = iconoDeCategoria(p.categoria);

    const info = el('div', 'pendiente-info');
    info.appendChild(el('div', 'tarjeta-codigo', `${p.equipoCodigo} · ${p.categoria}`));
    info.appendChild(el('div', 'tarjeta-nombre', p.equipoNombre));
    info.appendChild(el('div', 'tarjeta-categoria', `${p.empleadoNombre} · ${p.empleadoSede || ''}`));
    info.appendChild(
      p.devolucionSolicitada
        ? badge('badge-warn', 'Solicitada por el empleado')
        : badge('badge-neutro', 'Aún en poder del empleado')
    );
    if (p.incidenciasAbiertas > 0) {
      info.appendChild(badge('badge-bad', `${p.incidenciasAbiertas} incidencia(s) abierta(s)`));
    }

    const boton = el('button', 'btn btn-primario', 'Certificar recepción');
    boton.addEventListener('click', () => abrirModalCert(p));

    const izq = el('div', 'pendiente-izq');
    izq.append(icono, info);
    card.append(izq, boton);
    return card;
  }

  async function cargarDevoluciones() {
    listaPend.innerHTML = '<p class="vacio">Cargando...</p>';
    try {
      const { prestamos } = await API.devolucionesPendientes();
      listaPend.innerHTML = '';
      $('contador-pendientes').textContent = prestamos.length ? `(${prestamos.length})` : '';
      vacioDev.hidden = prestamos.length > 0;
      prestamos.forEach((p) => listaPend.appendChild(tarjetaPendiente(p)));
    } catch (error) {
      listaPend.innerHTML = '';
      mostrarError(error.mensaje || 'No se pudo cargar la lista.');
    }
  }

  function filaComponenteEditable(comp) {
    const fila = el('div', 'check-editable');
    const etiqueta = el('div', 'check-editable-nombre');
    etiqueta.textContent = comp.nombre.replace(/_/g, ' ');
    if (comp.observacion) etiqueta.appendChild(el('span', 'nota', `Registrado: ${comp.observacion}`));

    const opciones = el('div', 'opciones-estado');
    COMPONENTE_ESTADOS.forEach(({ valor, etiqueta: txt }) => {
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

  async function abrirModalCert(p) {
    certSeleccion = p;
    certAviso.hidden = true;
    certIncidencias.hidden = true;
    certObs.value = '';
    $('cert-paso-form').hidden = false;
    $('cert-paso-ok').hidden = true;
    $('cert-titulo').textContent = `Certificar: ${p.equipoNombre}`;
    $('cert-subtitulo').textContent = `${p.equipoCodigo} · prestado a ${p.empleadoNombre}`;
    certChecklist.innerHTML = '<p class="vacio">Cargando estado del equipo...</p>';
    modalCert.hidden = false;

    try {
      const [detalle, incs] = await Promise.all([
        API.equipo(p.equipoId),
        API.incidencias(`?prestamoId=${p.prestamoId}`),
      ]);
      estadoComponentes = {};
      detalle.componentes.forEach((c) => {
        estadoComponentes[c.nombre] = c.estado;
      });
      certChecklist.innerHTML = '';
      detalle.componentes.forEach((c) => certChecklist.appendChild(filaComponenteEditable(c)));

      const abiertas = incs.incidencias.filter((i) => i.estado !== 'Cerrada');
      if (abiertas.length) {
        certIncidencias.hidden = false;
        certIncidencias.innerHTML =
          `<strong>${abiertas.length} incidencia(s) abierta(s) en este préstamo:</strong><br>` +
          abiertas.map((i) => `• ${i.descripcion}`).join('<br>');
      }
    } catch (error) {
      certChecklist.innerHTML = '';
      certAviso.textContent = error.mensaje || 'No se pudo cargar el estado del equipo.';
      certAviso.hidden = false;
    }
  }

  $('btn-cancelar-cert').addEventListener('click', () => (modalCert.hidden = true));
  modalCert.addEventListener('click', (e) => {
    if (e.target === modalCert) modalCert.hidden = true;
  });
  $('btn-cerrar-cert-ok').addEventListener('click', () => {
    modalCert.hidden = true;
    cargarDevoluciones();
  });
  $('btn-registrar-cert').addEventListener('click', async () => {
    if (enviando || !certSeleccion) return;
    enviando = true;
    $('btn-registrar-cert').disabled = true;
    certAviso.hidden = true;
    try {
      const respuesta = await API.certificarDevolucion(certSeleccion.prestamoId, {
        items: estadoComponentes,
        observaciones: certObs.value.trim(),
      });
      $('cert-texto-ok').textContent =
        `${respuesta.mensaje} Equipo ${certSeleccion.equipoNombre} → estado "${respuesta.equipo.estado}".`;
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

  // ===================== HU03: incidencias =====================
  const listaInc = $('lista-incidencias');
  const vacioInc = $('vacio-inc');
  let filtroEstadoInc = '';

  const modalTri = $('modal-triage');
  const triAviso = $('tri-aviso');
  let triSeleccion = null;
  let triSeveridad = null;
  let triEstado = null;

  $('filtros-incidencias').addEventListener('click', (e) => {
    const tab = e.target.closest('.tab');
    if (!tab) return;
    $('filtros-incidencias').querySelectorAll('.tab').forEach((t) => t.classList.remove('activo'));
    tab.classList.add('activo');
    filtroEstadoInc = tab.dataset.estado;
    cargarIncidencias();
  });

  function tarjetaIncidencia(i) {
    const card = el('div', 'tarjeta-pendiente');
    const icono = el('div', 'tarjeta-icono');
    icono.innerHTML = iconoDeCategoria(i.categoria);

    const info = el('div', 'pendiente-info');
    info.appendChild(el('div', 'tarjeta-codigo', `${i.equipoCodigo} · ${i.categoria}`));
    info.appendChild(el('div', 'tarjeta-nombre', i.equipoNombre));
    info.appendChild(el('div', 'tarjeta-categoria',
      `${i.reportadoPorNombre || 'Empleado'} · ${new Date(i.fechaReporte.replace(' ', 'T')).toLocaleDateString('es-EC')}`));
    info.appendChild(el('blockquote', 'cita cita-compacta', i.descripcion));

    const badges = el('div', 'tarjeta-badges');
    badges.appendChild(badge(SEVERIDAD_CLASE[i.severidad] || 'badge-neutro', i.severidad, true));
    badges.appendChild(badge(ESTADO_INC_CLASE[i.estado] || 'badge-neutro', i.estado));
    info.appendChild(badges);

    const boton = el('button', 'btn btn-primario', 'Atender');
    boton.addEventListener('click', () => abrirModalTriage(i));

    const izq = el('div', 'pendiente-izq');
    izq.append(icono, info);
    card.append(izq, boton);
    return card;
  }

  async function cargarIncidencias() {
    listaInc.innerHTML = '<p class="vacio">Cargando...</p>';
    try {
      const params = filtroEstadoInc ? `?estado=${encodeURIComponent(filtroEstadoInc)}` : '';
      const { incidencias } = await API.incidencias(params);
      const abiertas = incidencias.filter((i) => i.estado !== 'Cerrada').length;
      $('contador-incidencias').textContent = abiertas ? `(${abiertas})` : '';
      listaInc.innerHTML = '';
      vacioInc.hidden = incidencias.length > 0;
      incidencias.forEach((i) => listaInc.appendChild(tarjetaIncidencia(i)));
    } catch (error) {
      listaInc.innerHTML = '';
      mostrarError(error.mensaje || 'No se pudieron cargar las incidencias.');
    }
  }

  function marcarSeleccion(contenedorId, atributo, valor) {
    $(contenedorId).querySelectorAll('.opcion').forEach((b) => {
      b.classList.toggle('sel-activa', b.dataset[atributo] === valor);
    });
  }

  $('tri-severidad').addEventListener('click', (e) => {
    const b = e.target.closest('.opcion');
    if (!b) return;
    triSeveridad = b.dataset.sev;
    marcarSeleccion('tri-severidad', 'sev', triSeveridad);
  });
  $('tri-estado').addEventListener('click', (e) => {
    const b = e.target.closest('.opcion');
    if (!b) return;
    triEstado = b.dataset.est;
    marcarSeleccion('tri-estado', 'est', triEstado);
  });

  function abrirModalTriage(i) {
    triSeleccion = i;
    triAviso.hidden = true;
    $('tri-paso-form').hidden = false;
    $('tri-paso-ok').hidden = true;
    $('tri-titulo').textContent = `Atender: ${i.equipoNombre}`;
    $('tri-subtitulo').textContent = `${i.equipoCodigo} · reportada por ${i.reportadoPorNombre || 'el empleado'}`;
    $('tri-descripcion').textContent = i.descripcion;
    $('tri-notas').value = i.notasTic || '';
    triSeveridad = i.severidad === 'sin clasificar' ? null : i.severidad;
    triEstado = i.estado;
    marcarSeleccion('tri-severidad', 'sev', triSeveridad);
    marcarSeleccion('tri-estado', 'est', triEstado);
    modalTri.hidden = false;
  }

  $('btn-cancelar-tri').addEventListener('click', () => (modalTri.hidden = true));
  modalTri.addEventListener('click', (e) => {
    if (e.target === modalTri) modalTri.hidden = true;
  });
  $('btn-cerrar-tri-ok').addEventListener('click', () => {
    modalTri.hidden = true;
    cargarIncidencias();
  });

  $('btn-guardar-tri').addEventListener('click', async () => {
    if (enviando || !triSeleccion) return;
    const cambios = {};
    if (triSeveridad && triSeveridad !== triSeleccion.severidad) cambios.severidad = triSeveridad;
    if (triEstado && triEstado !== triSeleccion.estado) cambios.estado = triEstado;
    const notas = $('tri-notas').value.trim();
    if (notas !== (triSeleccion.notasTic || '')) cambios.notasTic = notas;

    if (Object.keys(cambios).length === 0) {
      triAviso.textContent = 'No cambiaste nada.';
      triAviso.hidden = false;
      return;
    }

    enviando = true;
    $('btn-guardar-tri').disabled = true;
    triAviso.hidden = true;
    try {
      const r = await API.triarIncidencia(triSeleccion.id, cambios);
      $('tri-texto-ok').textContent =
        `Incidencia #${r.incidencia.id}: severidad "${r.incidencia.severidad}", estado "${r.incidencia.estado}".`;
      $('tri-paso-form').hidden = true;
      $('tri-paso-ok').hidden = false;
    } catch (error) {
      triAviso.textContent = error.mensaje || 'No se pudo actualizar la incidencia.';
      triAviso.hidden = false;
    } finally {
      enviando = false;
      $('btn-guardar-tri').disabled = false;
    }
  });

  // ===================== arranque =====================
  cargarDevoluciones();
  cargarIncidencias(); // para el contador de la pestaña
})();
