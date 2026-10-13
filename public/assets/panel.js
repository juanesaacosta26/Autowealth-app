// =====================================================================
//  panel.js — Lógica del panel financiero (/app).
//  Responsable: David. Llama a la API (/api/finanzas, /api/openfinance, /api/privacidad).
//  Las funciones están agrupadas por pestaña: Resumen, Movimientos, Cuentas y bancos, Privacidad.
// =====================================================================
(function () {
  'use strict';

  // ================= Utilidades =================
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pesos = (v) => '$' + Math.round(Math.abs(v)).toLocaleString('es-CO');
  const pesosConSigno = (v) => (v < 0 ? '−' : '+') + pesos(v);
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const nombreMes = (m, conAnio = true) => { const [a, n] = m.split('-').map(Number); return MESES[n - 1] + (conAnio ? ' de ' + a : ''); };
  const mesCorto = (m) => MESES[Number(m.split('-')[1]) - 1].slice(0, 3);
  const fechaCorta = (f) => { const [a, m, d] = f.slice(0, 10).split('-'); return `${Number(d)} ${MESES[Number(m) - 1].slice(0, 3)} ${a}`; };
  const fechaHora = (f) => new Date(f).toLocaleString('es-CO', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const fechaLarga = (f) => new Date(f).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
  const hoy = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
  const TIPOS = { ahorros: ['Cuenta de ahorros', 'fa-piggy-bank'], corriente: ['Cuenta corriente', 'fa-building-columns'], tarjeta_credito: ['Tarjeta de crédito', 'fa-credit-card'], billetera: ['Billetera digital', 'fa-mobile-screen'], efectivo: ['Efectivo', 'fa-money-bill-wave'], otra: ['Otra', 'fa-wallet'] };
  const ORIGEN = { openfinance: ['fa-building-columns', 'Traído de tu banco (Open Finance)'], manual: ['fa-pen', 'Registrado a mano'], extracto: ['fa-file-csv', 'Importado de un extracto'] };

  let toastTimer;
  function toast(texto) {
    let t = $('.toast');
    if (!t) { t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = texto; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 3200);
  }
  function aviso(tipo, html) {
    const iconos = { ok: 'fa-circle-check', bad: 'fa-circle-exclamation', info: 'fa-circle-info' };
    $('#aviso').innerHTML = html ? `<div class="${tipo}"><i class="fas ${iconos[tipo]}" style="margin-top:3px"></i><span>${html}</span></div>` : '';
  }

  async function api(ruta, opciones = {}) {
    const init = { method: opciones.method || 'GET', credentials: 'same-origin', headers: {} };
    if (opciones.body !== undefined) { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(opciones.body); }
    let res;
    try { res = await fetch(ruta, init); } catch (e) { throw new Error('No hay conexión con el servidor. Revisa tu internet.'); }
    const datos = await res.json().catch(() => ({ ok: false, error: 'Respuesta inesperada del servidor.' }));
    if (res.status === 401 && datos.sesion === false) { location.href = '/?entrar=1'; throw new Error('Sesión vencida'); }
    if (!datos.ok) throw new Error(datos.error || 'Algo salió mal.');
    return datos;
  }

  // ================= Estado =================
  const estado = { resumen: null, mes: null, movimientos: [], categorias: null, cuentas: [], conexiones: [], tipos: [], bancos: null, consentimiento: null, filtroCategoria: '' };

  // ================= Pestañas =================
  const PESTANAS = ['resumen', 'movimientos', 'cuentas', 'privacidad'];
  function abrirPestana(nombre, { foco = false } = {}) {
    if (!PESTANAS.includes(nombre)) nombre = 'resumen';
    for (const p of PESTANAS) {
      const activa = p === nombre;
      $('#t-' + p).setAttribute('aria-selected', String(activa));
      $('#t-' + p).tabIndex = activa ? 0 : -1;
      $('#p-' + p).hidden = !activa;
    }
    if (foco) $('#t-' + nombre).focus();
    if (location.hash !== '#' + nombre) history.replaceState(null, '', '#' + nombre);
    cargarPestana(nombre);
  }
  $$('.pestanas [role=tab]').forEach((b) => {
    b.addEventListener('click', () => abrirPestana(b.dataset.tab));
    b.addEventListener('keydown', (e) => {
      const i = PESTANAS.indexOf(b.dataset.tab);
      if (e.key === 'ArrowRight') abrirPestana(PESTANAS[(i + 1) % 4], { foco: true });
      if (e.key === 'ArrowLeft') abrirPestana(PESTANAS[(i + 3) % 4], { foco: true });
    });
  });
  function cargarPestana(nombre) {
    const fallo = (e) => aviso('bad', esc(e.message));
    if (nombre === 'resumen') cargarResumen().catch(fallo);
    if (nombre === 'movimientos') cargarMovimientos().catch(fallo);
    if (nombre === 'cuentas') cargarCuentas().catch(fallo);
    if (nombre === 'privacidad') cargarPrivacidad().catch(fallo);
  }

  // ================= Resumen =================
  async function cargarResumen() {
    const r = await api('/api/finanzas/resumen' + (estado.mes ? '?mes=' + estado.mes : ''));
    estado.resumen = r; estado.mes = r.mes;
    $('#saludo').textContent = 'Hola, ' + r.usuario.nombre;
    const hayDatos = r.mesesDisponibles.length > 0;
    $('#resumenVacio').hidden = hayDatos;
    $('#resumenDatos').hidden = !hayDatos;
    if (!hayDatos) return;

    const sel = $('#selMes');
    const meses = [...new Set([r.mes, ...r.mesesDisponibles])].sort().reverse();
    sel.innerHTML = meses.map((m) => `<option value="${m}" ${m === r.mes ? 'selected' : ''}>${nombreMes(m)}</option>`).join('');

    const esActual = r.mes === hoy().slice(0, 7);
    $('#mesEtiqueta').textContent = esActual ? 'Este mes, hasta hoy' : 'Resumen de ' + nombreMes(r.mes);
    const mesTxt = esActual ? 'Este mes' : 'En ' + nombreMes(r.mes, false);
    $('#declaracion').innerHTML = `${mesTxt} ${esActual ? 'has ganado' : 'ganaste'} <span class="cifra num">${pesos(r.ingresos)}</span> y ${esActual ? 'has gastado' : 'gastaste'} <span class="cifra gasto num">${pesos(r.gastos)}</span>.`;
    $('#remate').textContent = r.ingresos === 0 && r.gastos === 0
      ? 'No hay movimientos en este mes.'
      : esActual && r.ingresos === 0
        ? 'Todavía no hay ingresos registrados este mes. Mira el mes anterior en el selector para ver un mes completo.'
        : r.ahorro >= 0
          ? `Te ${esActual ? 'quedan' : 'quedaron'} ${pesos(r.ahorro)}${r.ingresos > 0 ? `, el ${r.tasaAhorro}% de lo que ingresó` : ''}.`
          : `${esActual ? 'Llevas gastados' : 'Gastaste'} ${pesos(r.ahorro)} más de lo que ingresó.`;

    const datos = [];
    if (r.cuentas.length) datos.push(['Disponible en tus cuentas', pesos(r.disponible)]);
    if (r.mesesFondo !== null) datos.push(['Alcanza para', `${String(r.mesesFondo).replace('.', ',')} meses de gastos`]);
    if (r.deudaTarjetas > 0) datos.push(['Deuda en tarjetas', pesos(r.deudaTarjetas)]);
    if (r.conexiones.length) datos.push(['Bancos conectados', String(r.conexiones.length)]);
    $('#datosLinea').innerHTML = datos.map(([a, b]) => `<div><span>${esc(a)}</span><b class="num">${esc(b)}</b></div>`).join('');

    dibujarMeses(r.serie, r.mes);
    dibujarCategorias(r.porCategoria, r.gastos);

    const iconos = { bien: 'fa-circle-check', atencion: 'fa-triangle-exclamation', alerta: 'fa-circle-exclamation', info: 'fa-lightbulb' };
    $('#consejos').innerHTML = r.recomendaciones.map((c) => `<li class="${c.tipo}"><i class="fas ${iconos[c.tipo] || 'fa-lightbulb'}" aria-hidden="true"></i><span>${esc(c.texto)}</span></li>`).join('');

    $('#recurrentes').innerHTML = r.suscripciones.length
      ? r.suscripciones.map((s) => `<li><span><b>${esc(s.nombre)}</b><br><span class="detalle">${esc(s.categoria)}, último cobro ${fechaCorta(s.ultimoCobro)}</span></span><span class="num" style="text-align:right"><b>${pesos(s.montoMensual)}</b><br><span class="detalle">${pesos(s.montoMensual * 12)} al año</span></span></li>`).join('')
      : '<li class="detalle">No encontramos pagos que se repitan con el mismo valor.</li>';

    const h = r.hormiga;
    $('#hormiga').innerHTML = h.cantidad
      ? `<p style="font-size:1.6rem;font-weight:700;margin:4px 0" class="num">${pesos(h.total)}</p><p style="color:var(--text-2);margin:0">en ${h.cantidad} compras pequeñas ${esActual ? 'este mes' : 'en ' + nombreMes(r.mes, false)}. Si las redujeras a la mitad, ahorrarías <b class="num">${pesos(h.total / 2)}</b> al mes y <b class="num">${pesos(h.total * 6)}</b> al año.</p>`
      : '<p class="detalle" style="color:var(--muted)">No hay compras pequeñas frecuentes este mes.</p>';
  }
  $('#selMes').addEventListener('change', (e) => { estado.mes = e.target.value; cargarResumen().catch((err) => aviso('bad', esc(err.message))); });

  // Gráfica de barras agrupadas: ingresos vs gastos por mes (SVG con tooltip)
  function dibujarMeses(serie, mesSel) {
    const cont = $('#graficaMeses');
    const W = 520, H = 230, M = { t: 18, r: 8, b: 26, l: 46 };
    const iw = W - M.l - M.r, ih = H - M.t - M.b;
    const max = Math.max(1, ...serie.flatMap((s) => [s.ingresos, s.gastos]));
    const paso = escalaBonita(max);
    const tope = Math.ceil(max / paso) * paso;
    const y = (v) => M.t + ih - (v / tope) * ih;
    const gw = iw / serie.length, bw = Math.min(26, (gw - 14) / 2);
    const corto = (v) => v >= 1e6 ? '$' + (v / 1e6).toLocaleString('es-CO', { maximumFractionDigits: 1 }) + ' M' : v >= 1e3 ? '$' + Math.round(v / 1e3) + ' mil' : '$' + v;
    const barra = (x, v, color) => {
      const h = Math.max(0, M.t + ih - y(v)); if (h <= 0) return '';
      const r = Math.min(4, h, bw / 2), yt = y(v), yb = M.t + ih;
      return `<path d="M${x},${yb} V${yt + r} Q${x},${yt} ${x + r},${yt} H${x + bw - r} Q${x + bw},${yt} ${x + bw},${yt + r} V${yb} Z" fill="${color}"/>`;
    };
    let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Ingresos y gastos de los últimos 6 meses">`;
    for (let v = 0; v <= tope; v += paso) {
      svg += `<line x1="${M.l}" x2="${W - M.r}" y1="${y(v)}" y2="${y(v)}" stroke="var(--grid)" stroke-width="1"/>`;
      svg += `<text class="eje" x="${M.l - 6}" y="${y(v) + 4}" text-anchor="end">${corto(v)}</text>`;
    }
    serie.forEach((s, i) => {
      const x0 = M.l + i * gw, cx = x0 + gw / 2;
      svg += `<g class="grupo" tabindex="0" data-i="${i}" aria-label="${nombreMes(s.mes)}: ingresos ${pesos(s.ingresos)}, gastos ${pesos(s.gastos)}">`;
      svg += `<rect class="zona" x="${x0 + 2}" y="${M.t}" width="${gw - 4}" height="${ih}" rx="6" fill="transparent"/>`;
      svg += barra(cx - bw - 1, s.ingresos, 'var(--serie-ingresos)') + barra(cx + 1, s.gastos, 'var(--serie-gastos)');
      if (s.mes === mesSel) {
        if (s.ingresos) svg += `<text class="etiqueta" x="${cx - bw / 2 - 1}" y="${y(s.ingresos) - 5}" text-anchor="middle">${corto(s.ingresos)}</text>`;
        if (s.gastos) svg += `<text class="etiqueta" x="${cx + bw / 2 + 1}" y="${y(s.gastos) - 5}" text-anchor="middle">${corto(s.gastos)}</text>`;
      }
      svg += `<text class="eje" x="${cx}" y="${H - 6}" text-anchor="middle" style="${s.mes === mesSel ? 'font-weight:700;fill:var(--text)' : ''}">${mesCorto(s.mes)}</text></g>`;
    });
    svg += '</svg><div class="tooltip" hidden></div>';
    cont.innerHTML = svg;

    const tip = $('.tooltip', cont);
    const mostrar = (g) => {
      const s = serie[Number(g.dataset.i)], dif = s.ingresos - s.gastos;
      tip.innerHTML = `<b>${nombreMes(s.mes)}</b><div class="fila"><span><i style="background:var(--serie-ingresos)"></i>Ingresos</span><span class="num">${pesos(s.ingresos)}</span></div><div class="fila"><span><i style="background:var(--serie-gastos)"></i>Gastos</span><span class="num">${pesos(s.gastos)}</span></div><div class="fila" style="margin-top:4px;color:var(--text)"><span>${dif >= 0 ? 'Ahorro' : 'Faltante'}</span><span class="num">${pesos(dif)}</span></div>`;
      tip.hidden = false;
      const caja = cont.getBoundingClientRect(), zona = g.getBoundingClientRect();
      let left = zona.left - caja.left + zona.width / 2 - tip.offsetWidth / 2;
      left = Math.max(0, Math.min(left, caja.width - tip.offsetWidth));
      tip.style.left = left + 'px'; tip.style.top = Math.max(0, zona.top - caja.top - tip.offsetHeight - 6) + 'px';
    };
    $$('.grupo', cont).forEach((g) => {
      g.addEventListener('mouseenter', () => mostrar(g)); g.addEventListener('focus', () => mostrar(g));
      g.addEventListener('mouseleave', () => { tip.hidden = true; }); g.addEventListener('blur', () => { tip.hidden = true; });
      g.addEventListener('click', () => { estado.mes = serie[Number(g.dataset.i)].mes; cargarResumen().catch(() => {}); });
    });
    $('#tablaMeses').innerHTML = `<table><thead><tr><th>Mes</th><th>Ingresos</th><th>Gastos</th><th>Diferencia</th></tr></thead><tbody>${serie.map((s) => `<tr><td>${nombreMes(s.mes)}</td><td class="num">${pesos(s.ingresos)}</td><td class="num">${pesos(s.gastos)}</td><td class="num">${s.ingresos - s.gastos < 0 ? '−' : ''}${pesos(s.ingresos - s.gastos)}</td></tr>`).join('')}</tbody></table>`;
  }
  function escalaBonita(max) {
    const bruto = max / 4, mag = Math.pow(10, Math.floor(Math.log10(bruto))), n = bruto / mag;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag;
  }

  function dibujarCategorias(cats, total) {
    const cont = $('#barrasCat');
    if (!cats.length) { cont.innerHTML = '<p class="vacio">No hay gastos en este mes.</p>'; return; }
    const visibles = cats.length > 8 ? [...cats.slice(0, 7), { categoria: 'Otras categorías', total: cats.slice(7).reduce((a, c) => a + c.total, 0), varias: true }] : cats;
    const max = visibles[0].total;
    cont.innerHTML = visibles.map((c) => `<button class="barra-cat" ${c.varias ? 'disabled' : `data-cat="${esc(c.categoria)}"`} aria-label="${esc(c.categoria)}: ${pesos(c.total)}, ${Math.round(c.total / total * 100)}% de los gastos">
      <span class="nombre">${esc(c.categoria)}</span>
      <span class="pista"><span class="relleno" style="width:${Math.max(2, c.total / max * 100)}%"></span></span>
      <span class="valor num">${pesos(c.total)} <span style="color:var(--muted);font-weight:500">${Math.round(c.total / total * 100)}%</span></span></button>`).join('');
    $$('.barra-cat[data-cat]', cont).forEach((b) => b.addEventListener('click', () => { estado.filtroCategoria = b.dataset.cat; abrirPestana('movimientos'); }));
  }

  // ================= Movimientos =================
  async function cargarMovimientos() {
    if (!estado.resumen) await cargarResumen();
    const r = estado.resumen;
    const fMes = $('#fMes');
    const meses = [...new Set([estado.mes, ...r.mesesDisponibles].filter(Boolean))].sort().reverse();
    const mesElegido = fMes.dataset.listo ? fMes.value : estado.mes;
    fMes.innerHTML = meses.map((m) => `<option value="${m}">${nombreMes(m)}</option>`).join('') + '<option value="">Todos (12 meses)</option>';
    fMes.value = mesElegido ?? ''; fMes.dataset.listo = '1';

    const fCuenta = $('#fCuenta'), cuentaSel = fCuenta.value;
    fCuenta.innerHTML = '<option value="">Todas</option>' + r.cuentas.map((c) => `<option value="${c.id}">${esc(c.nombre)}${c.institucion ? ' · ' + esc(nombreBanco(c.institucion)) : ''}</option>`).join('');
    fCuenta.value = cuentaSel;

    const q = new URLSearchParams();
    if (fMes.value) q.set('mes', fMes.value);
    if (fCuenta.value) q.set('cuenta', fCuenta.value);
    const datos = await api('/api/finanzas/movimientos?' + q);
    estado.movimientos = datos.movimientos; estado.categorias = datos.categorias;

    const fCat = $('#fCategoria');
    fCat.innerHTML = '<option value="">Todas</option>' + opcionesCategorias();
    fCat.value = estado.filtroCategoria;
    pintarMovimientos();
  }
  function nombreBanco(id) { const c = (estado.resumen?.conexiones || estado.conexiones).find((x) => x.institucion === id); return c ? c.banco : id; }
  function opcionesCategorias(seleccionada, monto) {
    const c = estado.categorias; if (!c) return '';
    const grupo = (titulo, lista) => `<optgroup label="${titulo}">${lista.map((x) => `<option ${x === seleccionada ? 'selected' : ''}>${esc(x)}</option>`).join('')}</optgroup>`;
    if (monto === undefined) return grupo('Gastos', c.gastos) + grupo('Ingresos', c.ingresos) + grupo('Otros', [c.neutra]);
    return monto < 0 ? grupo('Gastos', c.gastos) + grupo('Otros', [c.neutra]) : grupo('Ingresos', c.ingresos) + grupo('Otros', [c.neutra]);
  }
  function pintarMovimientos() {
    const texto = $('#fTexto').value.trim().toLowerCase();
    const cat = $('#fCategoria').value;
    const lista = estado.movimientos.filter((m) => (!cat || m.categoria === cat) && (!texto || m.descripcion.toLowerCase().includes(texto) || m.categoria.toLowerCase().includes(texto)));
    const neutra = estado.categorias?.neutra;
    const ing = lista.filter((m) => m.monto > 0 && m.categoria !== neutra).reduce((a, m) => a + m.monto, 0);
    const gas = lista.filter((m) => m.monto < 0 && m.categoria !== neutra).reduce((a, m) => a - m.monto, 0);
    $('#totalesFiltro').innerHTML = `<span>${lista.length} movimientos</span><span>Ingresos <b class="num">${pesos(ing)}</b></span><span>Gastos <b class="num">${pesos(gas)}</b></span>`;
    const cuerpo = $('#cuerpoMovs');
    const mostrar = lista.slice(0, 400);
    cuerpo.innerHTML = mostrar.map((m) => {
      const [ico, tit] = ORIGEN[m.origen] || ORIGEN.manual;
      return `<tr data-id="${m.id}">
        <td class="c-origen"><i class="fas ${ico} origen" title="${tit}" aria-label="${tit}"></i></td>
        <td class="c-fecha num">${fechaCorta(m.fecha)}</td>
        <td class="c-desc"><span class="desc">${esc(m.descripcion)}</span><br><span class="cuenta">${esc(m.cuenta)}</span></td>
        <td class="c-cat"><label class="sr" for="cat-${m.id}">Categoría</label><select id="cat-${m.id}" data-cat="${m.id}">${opcionesCategorias(m.categoria, m.monto)}</select></td>
        <td class="monto num ${m.monto > 0 ? 'ingreso' : ''}">${pesosConSigno(m.monto)}</td>
        <td class="c-acc">${m.origen !== 'openfinance' ? `<button class="borrar" data-borrar="${m.id}" aria-label="Borrar movimiento ${esc(m.descripcion)}"><i class="fas fa-trash-can"></i></button>` : ''}</td></tr>`;
    }).join('');
    const vacio = $('#movsVacio');
    vacio.hidden = lista.length > 0;
    vacio.textContent = estado.movimientos.length ? 'Ningún movimiento coincide con los filtros.' : 'No hay movimientos en este período.';
    if (lista.length > mostrar.length) vacio.hidden = false, vacio.textContent = `Se muestran los primeros 400 de ${lista.length}. Usa los filtros para acotar.`;
  }
  ['#fMes', '#fCuenta'].forEach((s) => $(s).addEventListener('change', () => cargarMovimientos().catch((e) => aviso('bad', esc(e.message)))));
  $('#fCategoria').addEventListener('change', (e) => { estado.filtroCategoria = e.target.value; pintarMovimientos(); });
  $('#fTexto').addEventListener('input', pintarMovimientos);
  $('#cuerpoMovs').addEventListener('change', async (e) => {
    const id = e.target.dataset.cat; if (!id) return;
    try {
      await api('/api/finanzas/movimientos/' + id, { method: 'PATCH', body: { categoria: e.target.value } });
      const m = estado.movimientos.find((x) => String(x.id) === id); if (m) m.categoria = e.target.value;
      estado.resumen = null; toast('Categoría actualizada');
    } catch (err) { aviso('bad', esc(err.message)); }
  });
  $('#cuerpoMovs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-borrar]'); if (!b) return;
    confirmar({ titulo: 'Borrar movimiento', texto: 'Este movimiento se eliminará de tus registros.', boton: 'Borrar movimiento' }, async () => {
      await api('/api/finanzas/movimientos/' + b.dataset.borrar, { method: 'DELETE' });
      estado.resumen = null; await cargarMovimientos(); toast('Movimiento borrado');
    });
  });

  // ----- Registrar movimiento manual -----
  async function abrirRegistrar() {
    if (!estado.categorias) { const d = await api('/api/finanzas/movimientos?mes=' + hoy().slice(0, 7)); estado.categorias = d.categorias; }
    const c = await api('/api/finanzas/cuentas'); estado.cuentas = c.cuentas;
    const manuales = c.cuentas.filter((x) => x.origen === 'manual');
    $('#mCuenta').innerHTML = manuales.length ? manuales.map((x) => `<option value="${x.id}">${esc(x.nombre)}</option>`).join('') : '<option value="">Efectivo y otros (nueva)</option>';
    $('#mFecha').value = hoy(); $('#mFecha').max = hoy();
    $('#mValor').value = ''; $('#mDesc').value = ''; $('#mError').hidden = true;
    actualizarCategoriasForm();
    $('#dlgMovimiento').showModal(); $('#mValor').focus();
  }
  function actualizarCategoriasForm() {
    const tipo = $('input[name=tipo]:checked').value;
    $('#mCategoria').innerHTML = '<option value="">Automática (según la descripción)</option>' + opcionesCategorias(null, tipo === 'gasto' ? -1 : 1);
  }
  $$('input[name=tipo]').forEach((r) => r.addEventListener('change', actualizarCategoriasForm));
  $('#formMovimiento').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('#mGuardar'); btn.disabled = true; $('#mError').hidden = true;
    try {
      const r = await api('/api/finanzas/movimientos', { method: 'POST', body: {
        tipo: $('input[name=tipo]:checked').value, fecha: $('#mFecha').value, valor: leerNumero($('#mValor').value),
        descripcion: $('#mDesc').value, categoria: $('#mCategoria').value || undefined, cuentaId: Number($('#mCuenta').value) || undefined,
      } });
      $('#dlgMovimiento').close(); estado.resumen = null; toast('Movimiento guardado en ' + r.categoria);
      cargarPestana(pestanaActual());
    } catch (err) { $('#mError').textContent = err.message; $('#mError').hidden = false; } finally { btn.disabled = false; }
  });
  const pestanaActual = () => PESTANAS.find((p) => !$('#p-' + p).hidden) || 'resumen';
  // Convierte "45.000", "45000", "45.000,50" en número
  function leerNumero(t) {
    let s = String(t).replace(/[$\s]/g, '');
    if (s.includes(',') && s.includes('.')) s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
    else if (s.includes(',')) s = /,\d{1,2}$/.test(s) ? s.replace(',', '.') : s.replace(/,/g, '');
    else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
    return Number(s);
  }

  // ================= Cuentas y bancos =================
  async function cargarCuentas() {
    const c = await api('/api/finanzas/cuentas');
    estado.cuentas = c.cuentas; estado.conexiones = c.conexiones; estado.tipos = c.tipos;
    $('#cTipo').innerHTML = c.tipos.map((t) => `<option value="${t}">${TIPOS[t][0]}</option>`).join('');

    $('#listaConexiones').innerHTML = c.conexiones.length ? c.conexiones.map((x) => `
      <div class="tarjeta-banco">
        <div><b>${esc(x.banco)}</b> <span class="chip">Banco de prueba</span><br>
          <span class="detalle" style="color:var(--muted);font-size:.86rem">Conectado el ${fechaLarga(x.creado_en)}${x.ultima_sincronizacion ? '<br>Última actualización: ' + fechaHora(x.ultima_sincronizacion) : ''}<br>La autorización vence el ${fechaLarga(x.expira_en)}</span></div>
        <div class="acciones">
          <button class="btn chico" data-sync="${x.id}"><i class="fas fa-rotate"></i> Actualizar</button>
          <button class="btn chico peligro" data-revocar="${x.id}" data-banco="${esc(x.banco)}"><i class="fas fa-link-slash"></i> Revocar acceso</button>
        </div>
      </div>`).join('') : '<p class="vacio" style="text-align:left;padding:12px 0">Todavía no has conectado ningún banco.</p>';

    $('#listaCuentas').innerHTML = c.cuentas.length ? c.cuentas.map((k) => {
      const [tipoTxt, ico] = TIPOS[k.tipo] || TIPOS.otra;
      const origen = k.origen === 'openfinance' ? esc(nombreBancoDe(k.institucion, c.conexiones)) : 'Manual';
      const saldo = k.tipo === 'tarjeta_credito' && k.saldo < 0 ? `<span class="detalle">Debes</span> ${pesos(k.saldo)}` : (k.saldo < 0 ? '−' : '') + pesos(k.saldo);
      return `<div class="cuenta-fila"><span class="ico"><i class="fas ${ico}"></i></span>
        <span><b>${esc(k.nombre)}</b>${k.numero_ultimos4 ? ` <span class="detalle">terminada en ${esc(k.numero_ultimos4)}</span>` : ''}<br><span class="detalle" style="color:var(--muted);font-size:.85rem">${tipoTxt}, ${origen}, ${k.num_movimientos} movimientos</span></span>
        <b class="num" style="text-align:right">${saldo}</b>
        <span class="c-borrar">${k.origen === 'manual' ? `<button class="borrar" data-borrar-cuenta="${k.id}" data-nombre="${esc(k.nombre)}" aria-label="Borrar la cuenta ${esc(k.nombre)}"><i class="fas fa-trash-can"></i></button>` : ''}</span></div>`;
    }).join('') : '<p class="vacio" style="text-align:left;padding:12px 0">Aún no tienes cuentas. Conecta un banco o agrega una cuenta manual.</p>';
    actualizarDestinosCsv();
  }
  const nombreBancoDe = (id, conexiones) => (conexiones.find((x) => x.institucion === id) || {}).banco || id;

  $('#listaConexiones').addEventListener('click', async (e) => {
    const s = e.target.closest('[data-sync]'), r = e.target.closest('[data-revocar]');
    if (s) {
      s.disabled = true;
      try { const x = await api(`/api/openfinance/conexiones/${s.dataset.sync}/sincronizar`, { method: 'POST', body: {} }); toast(x.nuevos ? `${x.nuevos} movimientos nuevos` : 'Todo está al día'); estado.resumen = null; await cargarCuentas(); }
      catch (err) { aviso('bad', esc(err.message)); s.disabled = false; }
    }
    if (r) {
      confirmar({ titulo: `Revocar el acceso a ${r.dataset.banco}`, texto: `Auto-Wealth dejará de consultar ${r.dataset.banco} y borraremos las cuentas y movimientos que trajimos de ese banco. La autorización quedará en tu historial como revocada.`, boton: 'Revocar y borrar datos' }, async () => {
        await api('/api/openfinance/conexiones/' + r.dataset.revocar, { method: 'DELETE' });
        estado.resumen = null; await cargarCuentas(); toast('Acceso revocado y datos borrados');
      });
    }
  });
  $('#listaCuentas').addEventListener('click', (e) => {
    const b = e.target.closest('[data-borrar-cuenta]'); if (!b) return;
    confirmar({ titulo: `Borrar "${b.dataset.nombre}"`, texto: 'Se borrará la cuenta y todos sus movimientos.', boton: 'Borrar cuenta' }, async () => {
      await api('/api/finanzas/cuentas/' + b.dataset.borrarCuenta, { method: 'DELETE' });
      estado.resumen = null; await cargarCuentas(); toast('Cuenta borrada');
    });
  });
  $('#formCuenta').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api('/api/finanzas/cuentas', { method: 'POST', body: { nombre: $('#cNombre').value, tipo: $('#cTipo').value, saldoInicial: leerNumero($('#cSaldo').value || '0') } });
      $('#cNombre').value = ''; $('#cSaldo').value = ''; estado.resumen = null; await cargarCuentas(); toast('Cuenta agregada');
    } catch (err) { aviso('bad', esc(err.message)); }
  });

  // ----- Conectar un banco (consentimiento) -----
  async function abrirConectar() {
    if (!estado.bancos) { const b = await api('/api/openfinance/bancos'); estado.bancos = b.bancos; estado.consentimiento = b.consentimiento; }
    $('#listaBancos').innerHTML = estado.bancos.map((b) => `<label class="opcion-banco"><input type="radio" name="banco" value="${esc(b.id)}"><span class="ini">${esc(b.nombre.replace('Banco ', '').charAt(0))}</span><span><b>${esc(b.nombre)}</b><br><span style="color:var(--muted);font-size:.85rem">${b.tipo === 'billetera' ? 'Billetera digital' : 'Banco'} de prueba</span></span></label>`).join('');
    $('#conPaso1').hidden = false; $('#conPaso2').hidden = true; $('#conSiguiente').disabled = true; $('#conError').hidden = true;
    $('#dlgConectar').showModal();
  }
  $('#listaBancos').addEventListener('change', () => { $('#conSiguiente').disabled = !$('input[name=banco]:checked'); });
  $('#conSiguiente').addEventListener('click', () => {
    const id = $('input[name=banco]:checked').value, banco = estado.bancos.find((b) => b.id === id), t = estado.consentimiento;
    const vence = new Date(); vence.setMonth(vence.getMonth() + t.duracionMeses);
    $('#conBancoNombre').textContent = `Antes de continuar a ${banco.nombre}, revisa qué estás autorizando.`;
    $('#textoConsent').innerHTML = `
      <dt>Quién recibe la información</dt><dd>${esc(t.receptor)}</dd>
      <dt>Qué datos</dt><dd><ul>${t.datos.map((d) => `<li>${esc(d)}</li>`).join('')}</ul></dd>
      <dt>Para qué</dt><dd>${esc(t.finalidad)}</dd>
      <dt>Por cuánto tiempo</dt><dd>${t.duracionMeses} meses, hasta el ${fechaLarga(vence)}, o hasta que la revoques.</dd>
      <dt>Tipo de acceso</dt><dd>${esc(t.tipoAcceso)}</dd>
      <dt>Tus derechos</dt><dd>${esc(t.derechos)}</dd>`;
    $('#conAceptoTexto').textContent = `Autorizo a ${t.receptor} a consultar esta información en ${banco.nombre} en las condiciones descritas.`;
    $('#conAcepto').checked = false; $('#conIr').disabled = true; $('#conIr').textContent = 'Continuar a ' + banco.nombre;
    $('#conPaso1').hidden = true; $('#conPaso2').hidden = false; $('#conAcepto').focus();
  });
  $('#conAtras').addEventListener('click', () => { $('#conPaso1').hidden = false; $('#conPaso2').hidden = true; });
  $('#conAcepto').addEventListener('change', (e) => { $('#conIr').disabled = !e.target.checked; });
  $('#conIr').addEventListener('click', async () => {
    const b = $('#conIr'); b.disabled = true; $('#conError').hidden = true;
    try {
      const r = await api('/api/openfinance/consentimientos', { method: 'POST', body: { institucion: $('input[name=banco]:checked').value, acepta: true } });
      location.href = r.url;
    } catch (err) { $('#conError').textContent = err.message; $('#conError').hidden = false; b.disabled = false; }
  });

  // ----- Importar extracto CSV -----
  const csv = { filas: [], columnas: [] };
  $('#archivoCsv').addEventListener('change', async (e) => {
    const archivo = e.target.files[0]; if (!archivo) return;
    if (archivo.size > 3 * 1024 * 1024) { aviso('bad', 'El archivo pesa más de 3 MB. Descarga un período más corto.'); return; }
    const buf = await archivo.arrayBuffer();
    let texto;
    try { texto = new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch { texto = new TextDecoder('windows-1252').decode(buf); }
    csv.filas = leerCsv(texto.replace(/^﻿/, ''));
    if (csv.filas.length < 2) { aviso('bad', 'No encontramos filas en el archivo. ¿Es un CSV?'); return; }
    aviso('', '');
    prepararMapeo();
  });
  function leerCsv(texto) {
    const primeras = texto.split(/\r?\n/).slice(0, 10).join('\n');
    const sep = [';', ',', '\t', '|'].map((s) => [s, (primeras.match(new RegExp(s === '|' ? '\\|' : s, 'g')) || []).length]).sort((a, b) => b[1] - a[1])[0][0];
    const filas = []; let fila = [], campo = '', comillas = false;
    for (let i = 0; i < texto.length; i++) {
      const c = texto[i];
      if (comillas) { if (c === '"') { if (texto[i + 1] === '"') { campo += '"'; i++; } else comillas = false; } else campo += c; }
      else if (c === '"') comillas = true;
      else if (c === sep) { fila.push(campo.trim()); campo = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && texto[i + 1] === '\n') i++; fila.push(campo.trim()); if (fila.some((x) => x !== '')) filas.push(fila); fila = []; campo = ''; }
      else campo += c;
    }
    fila.push(campo.trim()); if (fila.some((x) => x !== '')) filas.push(fila);
    return filas;
  }
  function prepararMapeo() {
    const n = Math.max(...csv.filas.slice(0, 20).map((f) => f.length));
    const titulos = csv.filas[0];
    const pareceTitulo = titulos.some((t) => /[a-záéíóúñ]{3,}/i.test(t)) && !titulos.some((t) => /^\d{1,4}[/-]\d{1,2}[/-]\d{1,4}$/.test(t));
    $('#tieneTitulos').checked = pareceTitulo;
    csv.columnas = Array.from({ length: n }, (_, i) => (pareceTitulo && titulos[i] ? titulos[i] : 'Columna ' + (i + 1)));
    const opts = (extra = '') => extra + csv.columnas.map((c, i) => `<option value="${i}">${esc(c)}</option>`).join('');
    ['#colFecha', '#colDesc', '#colValor'].forEach((s) => { $(s).innerHTML = opts(); });
    ['#colDebito', '#colCredito'].forEach((s) => { $(s).innerHTML = opts(); });
    const adivinar = (re) => csv.columnas.findIndex((c) => re.test(c.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()));
    const set = (s, i) => { if (i >= 0) $(s).value = String(i); };
    set('#colFecha', adivinar(/fecha|date|dia/)); set('#colDesc', adivinar(/descrip|concepto|detalle|movimiento|referencia|transaccion/));
    set('#colValor', adivinar(/valor|monto|importe|amount|cantidad/));
    const deb = adivinar(/debito|cargo|retiro|salida/), cre = adivinar(/credito|abono|deposito|entrada/);
    set('#colDebito', deb); set('#colCredito', cre);
    $('#modoValor').value = deb >= 0 && cre >= 0 && adivinar(/valor|monto|importe/) < 0 ? 'dos' : 'una';
    $('#pasoMapeo').hidden = false; $('#pasoRevisar').hidden = false;
    actualizarVistaCsv();
  }
  function fechaCsv(t) {
    const s = String(t).trim().split(/[ T]/)[0];
    let a, m, d, r;
    if ((r = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/))) [, a, m, d] = r;
    else if ((r = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/))) [, d, m, a] = r;
    else if ((r = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2})$/))) { [, d, m, a] = r; a = '20' + a; }
    else if ((r = s.match(/^(\d{4})(\d{2})(\d{2})$/))) [, a, m, d] = r;
    else return null;
    const f = `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const x = new Date(f + 'T00:00:00Z');
    return Number.isNaN(x.getTime()) || x.toISOString().slice(0, 10) !== f ? null : f;
  }
  function valorCsv(t) {
    let s = String(t ?? '').trim(); if (!s) return 0;
    const neg = /^\(.*\)$/.test(s) || /-/.test(s);
    s = s.replace(/[()$\s\-+]/g, '').replace(/[A-Za-z]/g, '');
    if (!s) return NaN;
    const n = leerNumero(s);
    return neg ? -Math.abs(n) : n;
  }
  function filasConvertidas() {
    const inicio = $('#tieneTitulos').checked ? 1 : 0;
    const iF = Number($('#colFecha').value), iD = Number($('#colDesc').value), modo = $('#modoValor').value;
    const iV = Number($('#colValor').value), iDeb = Number($('#colDebito').value), iCre = Number($('#colCredito').value);
    const inv = $('#invertir').checked ? -1 : 1;
    return csv.filas.slice(inicio).map((f) => {
      let monto;
      if (modo === 'una') monto = valorCsv(f[iV]);
      else { const deb = Math.abs(valorCsv(f[iDeb]) || 0), cre = Math.abs(valorCsv(f[iCre]) || 0); monto = cre - deb; }
      monto = Math.round(monto * inv * 100) / 100;
      const fila = { fecha: fechaCsv(f[iF] || ''), descripcion: (f[iD] || '').trim(), monto };
      fila.valida = !!fila.fecha && !!fila.descripcion && Number.isFinite(monto) && monto !== 0;
      return fila;
    });
  }
  function actualizarVistaCsv() {
    const dos = $('#modoValor').value === 'dos';
    $('#campoValor').hidden = dos; $('#campoDebito').hidden = !dos; $('#campoCredito').hidden = !dos;
    if ($('#tieneTitulos').checked !== (csv.columnas[0] === csv.filas[0][0])) {
      const n = csv.columnas.length; csv.columnas = Array.from({ length: n }, (_, i) => ($('#tieneTitulos').checked && csv.filas[0][i] ? csv.filas[0][i] : 'Columna ' + (i + 1)));
      ['#colFecha', '#colDesc', '#colValor', '#colDebito', '#colCredito'].forEach((s) => { const v = $(s).value; $(s).innerHTML = csv.columnas.map((c, i) => `<option value="${i}">${esc(c)}</option>`).join(''); $(s).value = v; });
    }
    const filas = filasConvertidas(), validas = filas.filter((f) => f.valida);
    const ing = validas.filter((f) => f.monto > 0).reduce((a, f) => a + f.monto, 0), gas = validas.filter((f) => f.monto < 0).reduce((a, f) => a - f.monto, 0);
    $('#resumenCsv').innerHTML = `${validas.length} movimientos listos (ingresos ${pesos(ing)}, gastos ${pesos(gas)}).${filas.length - validas.length ? ` ${filas.length - validas.length} filas no se pudieron leer y se omitirán.` : ''}`;
    $('#previa').innerHTML = '<thead><tr><th>Fecha</th><th>Descripción</th><th style="text-align:right">Valor</th></tr></thead><tbody>' +
      filas.slice(0, 8).map((f) => f.valida ? `<tr><td class="num">${fechaCorta(f.fecha)}</td><td>${esc(f.descripcion)}</td><td class="num" style="text-align:right">${pesosConSigno(f.monto)}</td></tr>` : '<tr><td colspan="3" class="mal">Fila sin fecha, descripción o valor válidos</td></tr>').join('') + '</tbody>';
    $('#btnImportar').disabled = validas.length === 0;
  }
  ['#tieneTitulos', '#colFecha', '#colDesc', '#modoValor', '#colValor', '#colDebito', '#colCredito', '#invertir'].forEach((s) => $(s).addEventListener('change', actualizarVistaCsv));
  function actualizarDestinosCsv() {
    const sel = $('#destinoCsv'), previo = sel.value;
    sel.innerHTML = '<option value="">Una cuenta nueva</option>' + estado.cuentas.filter((c) => c.origen === 'manual').map((c) => `<option value="${c.id}">${esc(c.nombre)}</option>`).join('');
    if ([...sel.options].some((o) => o.value === previo)) sel.value = previo;
    $('#campoNuevaCuenta').hidden = !!sel.value;
  }
  $('#destinoCsv').addEventListener('change', actualizarDestinosCsv);
  $('#btnImportar').addEventListener('click', async () => {
    const validas = filasConvertidas().filter((f) => f.valida).map(({ fecha, descripcion, monto }) => ({ fecha, descripcion, monto }));
    if (validas.length > 3000) { aviso('bad', 'El archivo tiene más de 3.000 movimientos. Descarga un período más corto.'); return; }
    const b = $('#btnImportar'); b.disabled = true;
    try {
      const r = await api('/api/finanzas/importar', { method: 'POST', body: { filas: validas, cuentaId: Number($('#destinoCsv').value) || undefined, nombreCuentaNueva: $('#nombreNuevaCuenta').value, tipoCuentaNueva: 'ahorros' } });
      aviso('ok', `Importamos <b>${r.importados}</b> movimientos.${r.duplicados ? ` ${r.duplicados} ya existían y no se repitieron.` : ''}`);
      $('#archivoCsv').value = ''; $('#pasoMapeo').hidden = true; $('#pasoRevisar').hidden = true; estado.resumen = null; await cargarCuentas();
    } catch (err) { aviso('bad', esc(err.message)); } finally { b.disabled = false; }
  });

  // ================= Privacidad =================
  async function cargarPrivacidad() {
    const p = await api('/api/privacidad');
    const ESTADOS = { activo: ['Activa', 'ok'], revocado: ['Revocada', ''], rechazado: ['Rechazada en el banco', 'bad'], vencido: ['Vencida', 'warn'] };
    $('#listaAutorizaciones').innerHTML = p.consentimientos.length ? p.consentimientos.map((c) => {
      const [txt, cls] = ESTADOS[c.estado] || [c.estado, ''];
      return `<div class="autorizacion"><div class="linea"><span><b>${esc(c.banco)}</b> <span class="chip ${cls}">${txt}</span></span>
        ${c.estado === 'activo' && c.conexion_id ? `<button class="btn chico peligro" data-revocar-priv="${c.conexion_id}" data-banco="${esc(c.banco)}">Revocar</button>` : ''}</div>
        <details><summary>Ver detalle</summary>
        <p style="margin:6px 0">Otorgada: ${fechaHora(c.otorgado_en)}<br>${c.revocado_en ? 'Revocada: ' + fechaHora(c.revocado_en) : 'Vence el ' + fechaLarga(c.expira_en)}</p>
        <p style="margin:6px 0"><b>Datos:</b> ${esc(c.alcance.split(',').join(', '))}.<br><b>Finalidad:</b> ${esc(c.finalidad)}<br><b>Versión del texto aceptado:</b> ${esc(c.version_texto)}</p></details></div>`;
    }).join('') : '<p class="vacio" style="text-align:left;padding:8px 0">No has dado ninguna autorización de Open Finance.</p>';
    $('#historial').innerHTML = p.historial.length ? p.historial.map((h) => `<li><time datetime="${h.creado_en}">${fechaHora(h.creado_en)}</time><span>${esc(h.descripcion)}${h.detalle ? `<span class="det">${esc(h.detalle)}</span>` : ''}</span></li>`).join('') : '<li class="detalle">Sin actividad todavía.</li>';
  }
  $('#listaAutorizaciones').addEventListener('click', (e) => {
    const r = e.target.closest('[data-revocar-priv]'); if (!r) return;
    confirmar({ titulo: `Revocar el acceso a ${r.dataset.banco}`, texto: 'Dejaremos de consultar ese banco y borraremos las cuentas y movimientos que trajimos de él.', boton: 'Revocar y borrar datos' }, async () => {
      await api('/api/openfinance/conexiones/' + r.dataset.revocarPriv, { method: 'DELETE' });
      estado.resumen = null; await cargarPrivacidad(); toast('Acceso revocado y datos borrados');
    });
  });
  $('#btnBorrarFinanzas').addEventListener('click', () => confirmar({ titulo: 'Borrar toda tu información financiera', texto: 'Revocaremos todas tus autorizaciones y borraremos cuentas y movimientos (bancos, extractos y registros manuales). Tu cuenta de Auto-Wealth seguirá activa. Esta acción no se puede deshacer.', boton: 'Borrar mi información', clave: true },
    async (password) => { await api('/api/privacidad/borrar-finanzas', { method: 'POST', body: { password } }); estado.resumen = null; await cargarPrivacidad(); toast('Tu información financiera fue borrada'); }));
  $('#btnEliminarCuenta').addEventListener('click', () => confirmar({ titulo: 'Eliminar tu cuenta', texto: 'Borraremos tu cuenta y todos tus datos: perfil, autorizaciones, cuentas, movimientos e historial. Esta acción no se puede deshacer. Si quieres, primero descarga una copia de tus datos.', boton: 'Eliminar mi cuenta', clave: true },
    async (password) => { await api('/api/privacidad/eliminar-cuenta', { method: 'POST', body: { password } }); location.href = '/?cuenta=eliminada'; }));

  // ================= Diálogo de confirmación =================
  let accionConfirmada = null;
  function confirmar({ titulo, texto, boton, clave = false }, accion) {
    $('#dlgConfTitulo').textContent = titulo; $('#dlgConfTexto').textContent = texto; $('#confBoton').textContent = boton;
    $('#dlgConfClave').hidden = !clave; $('#confPassword').value = ''; $('#confError').hidden = true;
    accionConfirmada = accion; $('#dlgConfirmar').showModal();
    (clave ? $('#confPassword') : $('#confBoton')).focus();
  }
  $('#formConfirmar').addEventListener('submit', async (e) => {
    e.preventDefault();
    const b = $('#confBoton'); b.disabled = true; $('#confError').hidden = true;
    try { await accionConfirmada($('#confPassword').value); $('#dlgConfirmar').close(); }
    catch (err) { $('#confError').textContent = err.message; $('#confError').hidden = false; }
    finally { b.disabled = false; }
  });
  $$('[data-cerrar]').forEach((b) => b.addEventListener('click', () => b.closest('dialog').close()));

  // ================= Acciones generales =================
  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-accion]'); if (!a) return;
    const fallo = (err) => aviso('bad', esc(err.message));
    if (a.dataset.accion === 'conectar') abrirConectar().catch(fallo);
    if (a.dataset.accion === 'registrar') abrirRegistrar().catch(fallo);
    if (a.dataset.accion === 'importar') { abrirPestana('cuentas'); setTimeout(() => { $('#bloqueImportar').scrollIntoView({ behavior: 'smooth' }); $('#archivoCsv').focus(); }, 150); }
  });
  $('#btnSalir').addEventListener('click', async () => { try { await api('/api/salir', { method: 'POST', body: {} }); } catch (e) {} location.href = '/'; });
  $('#btnTema').addEventListener('click', () => {
    const t = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', t);
    try { localStorage.setItem('theme', t); } catch (e) {}
  });

  // Mensajes al volver del banco (?of=...)
  const of = new URLSearchParams(location.search).get('of');
  const MENSAJES_OF = {
    conectado: ['ok', 'Listo: conectamos tu banco y trajimos tus movimientos de los últimos 12 meses.'],
    rechazado: ['info', 'No se conectó el banco porque rechazaste la autorización. Puedes intentarlo cuando quieras.'],
    error: ['bad', 'No pudimos completar la conexión con el banco. Intenta de nuevo en unos minutos.'],
    invalido: ['bad', 'La solicitud de conexión venció o no es válida. Vuelve a empezar desde "Conectar un banco".'],
  };
  if (MENSAJES_OF[of]) { aviso(...MENSAJES_OF[of]); history.replaceState(null, '', location.pathname + location.hash); }

  abrirPestana((location.hash || '#resumen').slice(1));
})();
