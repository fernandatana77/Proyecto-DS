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

  const esAdmin = perfil.rol === 'Admin';

  // ===================== Tabs =====================
  if (esAdmin) {
    // HU05 (Dashboard) y HU06 (Bitácora) son solo para el Administrador
    $('tab-dashboard').hidden = false;
    $('tab-bitacora').hidden = false;
  }

  $('tabs-panel').addEventListener('click', (e) => {
    const tab = e.target.closest('.tab');
    if (!tab) return;
    $('tabs-panel').querySelectorAll('.tab').forEach((t) => t.classList.remove('activo'));
    tab.classList.add('activo');
    const vista = tab.dataset.vista;
    $('vista-devoluciones').hidden = vista !== 'devoluciones';
    $('vista-incidencias').hidden = vista !== 'incidencias';
    $('vista-dashboard').hidden = vista !== 'dashboard';
    $('vista-bitacora').hidden = vista !== 'bitacora';
    if (vista === 'incidencias') cargarIncidencias();
    if (vista === 'dashboard') cargarDashboard();
    if (vista === 'bitacora') cargarBitacora();
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

  // ===================== HU05: dashboard (solo Admin) =====================
  let dashboardCategoria = ''; // '' = todas

  function tileVida(pct) {
    if (pct == null) return '—';
    const clase = pct >= 85 ? 'barra-bad' : pct >= 60 ? 'barra-warn' : 'barra-ok';
    return (
      `<span class="kpi-valor">${pct.toFixed(1)}%</span>` +
      `<span class="barra-vida"><span class="barra-vida-fill ${clase}" style="width:${Math.min(100, pct)}%"></span></span>`
    );
  }

  function renderKpis(t) {
    const row = $('kpi-row');
    row.innerHTML = '';
    const tiles = [
      { etiqueta: 'Total de equipos', valor: t.total },
      { etiqueta: 'Prestados', valor: t.prestados, clase: 'kpi-warn' },
      { etiqueta: 'En reparación', valor: t.enReparacion, clase: 'kpi-bad' },
      { etiqueta: 'Disponibles', valor: t.disponibles, clase: 'kpi-ok' },
    ];
    tiles.forEach((k) => {
      const d = el('div', `kpi ${k.clase || ''}`);
      d.innerHTML = `<span class="kpi-valor">${k.valor}</span><span class="kpi-etiqueta">${k.etiqueta}</span>`;
      row.appendChild(d);
    });
    const vida = el('div', 'kpi kpi-vida');
    vida.innerHTML =
      `${tileVida(t.vidaUtilPctPromedio)}<span class="kpi-etiqueta">Vida útil promedio` +
      `${t.conVidaUtil ? ` · ${t.conVidaUtil} equipos` : ''}</span>`;
    row.appendChild(vida);
  }

  function renderFiltrosDashboard(categorias) {
    const cont = $('filtros-dashboard');
    if (cont.dataset.listo) return;
    ['', ...categorias].forEach((cat) => {
      const b = el('button', 'tab' + (cat === dashboardCategoria ? ' activo' : ''), cat || 'Todas');
      b.addEventListener('click', () => {
        dashboardCategoria = cat;
        cont.querySelectorAll('.tab').forEach((x) => x.classList.remove('activo'));
        b.classList.add('activo');
        cargarDashboard();
      });
      cont.appendChild(b);
    });
    cont.dataset.listo = '1';
  }

  function renderTablaDashboard(porCategoria) {
    const cuerpo = $('cuerpo-dashboard');
    cuerpo.innerHTML = '';
    porCategoria.forEach((c) => {
      const tr = document.createElement('tr');
      tr.className = 'fila-clic';
      tr.innerHTML =
        `<td class="celda-principal">${c.categoria}</td>` +
        `<td>${c.total}</td><td>${c.disponibles}</td><td>${c.prestados}</td>` +
        `<td>${c.enReparacion}</td>` +
        `<td>${c.vidaUtilPct == null ? '—' : c.vidaUtilPct.toFixed(1) + '%'}</td>`;
      tr.addEventListener('click', () => {
        dashboardCategoria = dashboardCategoria === c.categoria ? '' : c.categoria;
        $('filtros-dashboard').querySelectorAll('.tab').forEach((x) =>
          x.classList.toggle('activo', (x.textContent === 'Todas' ? '' : x.textContent) === dashboardCategoria)
        );
        cargarDashboard();
      });
      cuerpo.appendChild(tr);
    });
  }

  function renderCercaFin(lista) {
    const bloque = $('cerca-fin-vida');
    bloque.hidden = lista.length === 0;
    const cont = $('lista-cerca-fin');
    cont.innerHTML = '';
    lista.forEach((e) => {
      const card = el('div', 'tarjeta-pendiente');
      const info = el('div', 'pendiente-info');
      info.appendChild(el('div', 'tarjeta-codigo', `${e.codigoInterno} · ${e.categoria}`));
      info.appendChild(el('div', 'tarjeta-nombre', e.nombre));
      info.appendChild(badge(e.estado === 'De Baja' ? 'badge-neutro' : 'badge-warn', e.estado));
      const pct = el('div', 'pct-grande', `${e.vidaUtilPct.toFixed(1)}%`);
      card.append(info, pct);
      cont.appendChild(card);
    });
  }

  async function cargarDashboard() {
    if (!esAdmin) return;
    $('aviso-dashboard').hidden = true;
    $('kpi-row').innerHTML = '<div class="kpi"><span class="kpi-valor">…</span></div>';
    try {
      const params = dashboardCategoria ? `?categoria=${encodeURIComponent(dashboardCategoria)}` : '';
      const d = await API.dashboard(params);
      renderFiltrosDashboard(d.categorias);
      renderKpis(d.totales);
      renderTablaDashboard(d.porCategoria);
      renderCercaFin(d.cercaFinVidaUtil);
    } catch (error) {
      $('kpi-row').innerHTML = '';
      $('aviso-dashboard').textContent = error.mensaje || 'No se pudo cargar el dashboard.';
      $('aviso-dashboard').hidden = false;
    }
  }

  // ===================== HU06: bitácora de auditoría (solo Admin, solo lectura) =====================
  const ACCION_CLASE = (accion) => {
    if (/FALLIDO|BLOQUEADO/.test(accion)) return 'badge-bad';
    if (/REPARACION|DEVUELT|DEVOLUCION/.test(accion)) return 'badge-warn';
    if (/EXITOSO|REGISTRAD|REPORTADA/.test(accion)) return 'badge-ok';
    return 'badge-neutro';
  };
  const ACTOR_CLASE = { Empleado: 'badge-info', Admin: 'badge-warn', 'Técnico': 'badge-neutro', Sistema: 'badge-neutro' };

  let bitacoraPagina = 1;
  let accionesCargadas = false;

  function leerFiltrosBitacora() {
    return {
      desde: $('f-desde').value || '',
      hasta: $('f-hasta').value || '',
      usuario: $('f-usuario').value.trim(),
      accion: $('f-accion').value,
      actorTipo: $('f-actor-tipo').value,
    };
  }

  function formatearFecha(iso) {
    // la BD guarda 'YYYY-MM-DD HH:MM:SS' (UTC); se muestra en hora local
    const d = new Date(iso.replace(' ', 'T') + 'Z');
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('es-EC', { dateStyle: 'short', timeStyle: 'medium' });
  }

  function formatearDetalle(detalle, ip) {
    const partes = [];
    if (detalle && typeof detalle === 'object') {
      for (const [k, v] of Object.entries(detalle)) {
        partes.push(`${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`);
      }
    }
    if (ip) partes.push(`ip: ${ip}`);
    return partes.length ? partes.join(' · ') : '—';
  }

  function filaBitacora(l) {
    const tr = document.createElement('tr');

    tr.appendChild(el('td', 'col-fecha', formatearFecha(l.fecha)));

    const tdUsuario = el('td');
    tdUsuario.appendChild(el('div', 'celda-principal', l.usuario));
    tdUsuario.appendChild(badge(ACTOR_CLASE[l.actorTipo] || 'badge-neutro', l.actorTipo));
    tr.appendChild(tdUsuario);

    const tdAccion = el('td');
    tdAccion.appendChild(badge(ACCION_CLASE(l.accion), l.accion));
    tr.appendChild(tdAccion);

    tr.appendChild(el('td', 'col-entidad', l.entidad ? `${l.entidad}${l.entidadId ? ' #' + l.entidadId : ''}` : '—'));
    tr.appendChild(el('td', 'col-detalle', formatearDetalle(l.detalle, l.ip)));

    return tr;
  }

  async function cargarAccionesFiltro() {
    if (accionesCargadas) return;
    try {
      const { acciones } = await API.accionesBitacora();
      const sel = $('f-accion');
      acciones.forEach((a) => {
        const opt = document.createElement('option');
        opt.value = a;
        opt.textContent = a;
        sel.appendChild(opt);
      });
      accionesCargadas = true;
    } catch {
      /* el filtro de acción queda solo con "Todas" */
    }
  }

  async function cargarBitacora() {
    if (!esAdmin) return;
    cargarAccionesFiltro();
    $('aviso-bitacora').hidden = true;
    const cuerpo = $('cuerpo-bitacora');
    cuerpo.innerHTML = '<tr><td colspan="5" class="vacio">Cargando...</td></tr>';

    const f = leerFiltrosBitacora();
    const qs = new URLSearchParams();
    Object.entries(f).forEach(([k, v]) => v && qs.set(k, v));
    qs.set('pagina', bitacoraPagina);
    qs.set('porPagina', 25);

    try {
      const r = await API.bitacora(`?${qs.toString()}`);
      cuerpo.innerHTML = '';
      $('vacio-bitacora').hidden = r.logs.length > 0;
      r.logs.forEach((l) => cuerpo.appendChild(filaBitacora(l)));

      const desde = r.total === 0 ? 0 : (r.pagina - 1) * r.porPagina + 1;
      const hasta = Math.min(r.pagina * r.porPagina, r.total);
      $('bitacora-rango').textContent = `${desde}–${hasta} de ${r.total}`;
      $('paginacion-bitacora').hidden = r.total <= r.porPagina;
      $('btn-bitacora-prev').disabled = r.pagina <= 1;
      $('btn-bitacora-next').disabled = r.pagina >= r.paginas;
    } catch (error) {
      cuerpo.innerHTML = '';
      $('aviso-bitacora').textContent = error.mensaje || 'No se pudo cargar la bitácora.';
      $('aviso-bitacora').hidden = false;
    }
  }

  $('filtros-bitacora').addEventListener('submit', (e) => {
    e.preventDefault();
    bitacoraPagina = 1;
    cargarBitacora();
  });
  $('btn-limpiar-bitacora').addEventListener('click', () => {
    $('filtros-bitacora').reset();
    bitacoraPagina = 1;
    cargarBitacora();
  });
  $('btn-bitacora-prev').addEventListener('click', () => {
    if (bitacoraPagina > 1) {
      bitacoraPagina -= 1;
      cargarBitacora();
    }
  });
  $('btn-bitacora-next').addEventListener('click', () => {
    bitacoraPagina += 1;
    cargarBitacora();
  });

  // ===================== arranque =====================
  cargarDevoluciones();
  cargarIncidencias(); // para el contador de la pestaña
})();
