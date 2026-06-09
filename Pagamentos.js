/**
 * OSKLEN INTRANET — Página: Fluxo de Pagamentos
 *
 * Migração completa do fluxo_pagamentos.html.
 * Preserva: upload de planilha, filtros multiselect (franqueado, franquia, período),
 * busca por NF, aba Calendário de Recebimentos e aba Carteira & Parcelas,
 * KPIs, grid de franquias vencidas, tabela de parcelas com paginação.
 */

import filtersStore from '../store/filtersStore.js';
import eventBus from '../store/eventBus.js';
import xlsxService from '../services/xlsxService.js';
import { formatBRL, formatN } from '../utils/formatters.js';

// ── Estado ────────────────────────────────────────────────────
let _el = null;
let _unsubFilters = null;
let _activeTab = 'tab-calendario';

let ALL_DATA    = [];
let filtered    = [];
let currentPage = 1;
const PAGE_SIZE = 50;

let selFranqueado = [];
let selFranquia   = [];
let selYear       = [];
let searchNF      = '';

let _openMS = null;

// ── Contrato público ──────────────────────────────────────────

export async function mount(el) {
  _el = el;
  _el.innerHTML = _shellHTML();
  _bindEvents();
  _unsubFilters = filtersStore.subscribe(() => {});
  eventBus.on('data:refresh', refresh);
}

export function unmount() {
  document.removeEventListener('click', _closeMS);
  if (_unsubFilters) { _unsubFilters(); _unsubFilters = null; }
  eventBus.off('data:refresh', refresh);
  _el = null;
}

export async function refresh() { if (_el && ALL_DATA.length) _applyAndRender(); }
export function onFilterChange() {}

// ── Shell ─────────────────────────────────────────────────────

function _shellHTML() {
  return `
    <!-- Controles -->
    <div style="padding:0 0 16px;display:flex;gap:16px;flex-wrap:wrap;align-items:flex-end;border-bottom:1px solid var(--border);margin-bottom:16px">
      <div style="display:flex;flex-direction:column;gap:4px">
        <label style="font-size:11px;color:var(--gray-500);text-transform:uppercase;letter-spacing:1px">Franqueado</label>
        <div style="position:relative" id="ms-wrap-franqueado">
          <button id="ms-btn-franqueado" style="display:flex;align-items:center;justify-content:space-between;padding:7px 10px;border:1px solid var(--border);border-radius:6px;font-size:12px;background:var(--surface);cursor:pointer;min-width:180px;font-family:var(--font)">
            <span id="ms-lbl-franqueado">Todos</span><i class="ti ti-chevron-down" style="font-size:12px"></i>
          </button>
          <div id="ms-drop-franqueado" style="display:none;position:absolute;top:calc(100%+4px);left:0;background:var(--surface);border:1px solid var(--border);border-radius:8px;box-shadow:var(--shadow-md);min-width:220px;z-index:300">
            <div style="padding:8px 12px;border-bottom:1px solid var(--border-light);display:flex;gap:6px">
              <button onclick="window._pag.msAll('franqueado')" style="font-size:11px;padding:3px 8px;border:1px solid var(--border);border-radius:4px;background:var(--surface);cursor:pointer;font-family:var(--font)">Todos</button>
              <button onclick="window._pag.msClear('franqueado')" style="font-size:11px;padding:3px 8px;border:1px solid var(--border);border-radius:4px;background:var(--surface);cursor:pointer;font-family:var(--font)">Limpar</button>
            </div>
            <div id="ms-list-franqueado" style="max-height:200px;overflow-y:auto"></div>
          </div>
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:4px">
        <label style="font-size:11px;color:var(--gray-500);text-transform:uppercase;letter-spacing:1px">Franquia</label>
        <div style="position:relative" id="ms-wrap-franquia">
          <button id="ms-btn-franquia" style="display:flex;align-items:center;justify-content:space-between;padding:7px 10px;border:1px solid var(--border);border-radius:6px;font-size:12px;background:var(--surface);cursor:pointer;min-width:260px;font-family:var(--font)">
            <span id="ms-lbl-franquia">Todas</span><i class="ti ti-chevron-down" style="font-size:12px"></i>
          </button>
          <div id="ms-drop-franquia" style="display:none;position:absolute;top:calc(100%+4px);left:0;background:var(--surface);border:1px solid var(--border);border-radius:8px;box-shadow:var(--shadow-md);min-width:280px;z-index:300">
            <div style="padding:8px 12px;border-bottom:1px solid var(--border-light);display:flex;gap:6px">
              <button onclick="window._pag.msAll('franquia')" style="font-size:11px;padding:3px 8px;border:1px solid var(--border);border-radius:4px;background:var(--surface);cursor:pointer;font-family:var(--font)">Todas</button>
              <button onclick="window._pag.msClear('franquia')" style="font-size:11px;padding:3px 8px;border:1px solid var(--border);border-radius:4px;background:var(--surface);cursor:pointer;font-family:var(--font)">Limpar</button>
            </div>
            <div id="ms-list-franquia" style="max-height:200px;overflow-y:auto"></div>
          </div>
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:4px">
        <label style="font-size:11px;color:var(--gray-500);text-transform:uppercase;letter-spacing:1px">Período</label>
        <div style="position:relative" id="ms-wrap-year">
          <button id="ms-btn-year" style="display:flex;align-items:center;justify-content:space-between;padding:7px 10px;border:1px solid var(--border);border-radius:6px;font-size:12px;background:var(--surface);cursor:pointer;min-width:120px;font-family:var(--font)">
            <span id="ms-lbl-year">Todos</span><i class="ti ti-chevron-down" style="font-size:12px"></i>
          </button>
          <div id="ms-drop-year" style="display:none;position:absolute;top:calc(100%+4px);left:0;background:var(--surface);border:1px solid var(--border);border-radius:8px;box-shadow:var(--shadow-md);min-width:140px;z-index:300">
            <div style="padding:8px 12px;border-bottom:1px solid var(--border-light);display:flex;gap:6px">
              <button onclick="window._pag.msAll('year')" style="font-size:11px;padding:3px 8px;border:1px solid var(--border);border-radius:4px;background:var(--surface);cursor:pointer;font-family:var(--font)">Todos</button>
              <button onclick="window._pag.msClear('year')" style="font-size:11px;padding:3px 8px;border:1px solid var(--border);border-radius:4px;background:var(--surface);cursor:pointer;font-family:var(--font)">Limpar</button>
            </div>
            <div id="ms-list-year" style="max-height:200px;overflow-y:auto"></div>
          </div>
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:4px">
        <label style="font-size:11px;color:var(--gray-500);text-transform:uppercase;letter-spacing:1px">Buscar NF</label>
        <div style="display:flex;gap:8px;align-items:center">
          <input id="pag-search-nf" type="text" placeholder="ex: 720414" style="padding:7px 10px;border:1px solid var(--border);border-radius:6px;font-size:12px;background:var(--surface);outline:none;width:130px;font-family:var(--font)">
          <label style="display:flex;align-items:center;gap:6px;padding:7px 12px;background:var(--black);color:#fff;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap">
            <i class="ti ti-upload" style="font-size:13px"></i>Importar
            <input type="file" accept=".xls,.xlsx,.csv" style="display:none" id="pag-file-input">
          </label>
          <span id="pag-data-status" style="font-size:11px;color:var(--gray-400);white-space:nowrap">Aguardando dados</span>
        </div>
      </div>
    </div>

    <!-- Abas -->
    <div class="module-tabs">
      <button class="module-tab active" data-pag-tab="tab-calendario">📅 Calendário de Recebimentos</button>
      <button class="module-tab" data-pag-tab="tab-carteira">⚠️ Carteira & Parcelas</button>
    </div>

    <!-- Tab: Calendário -->
    <div id="pag-tab-calendario" style="padding-top:16px">
      <div id="pag-calendar-grid" class="fade-in"></div>
    </div>

    <!-- Tab: Carteira -->
    <div id="pag-tab-carteira" style="display:none;padding-top:16px">
      <!-- KPIs -->
      <div class="kpi-grid" style="margin-bottom:20px">
        <div class="kpi-card accent-red">
          <div class="kpi-label">Títulos Vencidos</div>
          <div class="kpi-value" id="kpi-qtd-venc">—</div>
          <div class="kpi-sub">notas fiscais</div>
        </div>
        <div class="kpi-card accent-red">
          <div class="kpi-label">Valor Total Vencido</div>
          <div class="kpi-value" id="kpi-val-venc">—</div>
          <div class="kpi-sub">em atraso</div>
        </div>
        <div class="kpi-card accent-amber">
          <div class="kpi-label">Títulos a Vencer</div>
          <div class="kpi-value" id="kpi-qtd-avencer">—</div>
          <div class="kpi-sub">notas fiscais</div>
        </div>
        <div class="kpi-card accent-amber">
          <div class="kpi-label">Valor a Vencer</div>
          <div class="kpi-value" id="kpi-val-avencer">—</div>
          <div class="kpi-sub">previsão de recebimento</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Vencido + a Vencer</div>
          <div class="kpi-value" id="kpi-total">—</div>
          <div class="kpi-sub">carteira total</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Valor Real</div>
          <div class="kpi-value" id="kpi-original">—</div>
          <div class="kpi-sub">valor original das NFs</div>
        </div>
      </div>

      <!-- Franquias vencidas -->
      <div style="font-size:13px;font-weight:600;margin-bottom:12px;color:var(--black)">Franquias com títulos vencidos</div>
      <div id="pag-franq-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:10px;margin-bottom:24px"></div>

      <!-- Tabela de parcelas -->
      <div class="table-card">
        <div class="table-card-header">
          <div class="table-card-title" id="pag-table-title">Todas as Parcelas</div>
        </div>
        <div class="table-scroll">
          <table style="width:100%;border-collapse:collapse;font-size:11px">
            <thead><tr>
              ${['NF','Franquia','Emissão','Cond. Pgto','Vencimento','Valor NF','Parcela','Vencto Real','Val. Original','Val. Atual','Dias Atraso','Vlr Vencido','Venc.+Vencer','Status'].map(h=>`<th style="padding:8px 12px;font-size:9px;font-weight:600;color:var(--gray-500);background:var(--gray-50);border-bottom:1px solid var(--border);text-transform:uppercase;letter-spacing:.5px;white-space:nowrap">${h}</th>`).join('')}
            </tr></thead>
            <tbody id="pag-table-body"></tbody>
          </table>
        </div>
        <div id="pag-pagination" style="padding:10px 16px;display:flex;justify-content:flex-end;gap:8px;align-items:center;border-top:1px solid var(--border-light)"></div>
      </div>
    </div>

    <!-- Sem dados -->
    <div id="pag-no-data" style="display:none">
      <div class="empty-state" style="padding:60px">
        <div class="empty-state-icon"><i class="ti ti-file-spreadsheet"></i></div>
        <div class="empty-state-title">Nenhum dado carregado</div>
        <div class="empty-state-sub">Importe a planilha de pagamentos (.xlsx) para visualizar o dashboard.</div>
      </div>
    </div>
  `;
}

// ── Bind ──────────────────────────────────────────────────────

function _bindEvents() {
  window._pag = {
    msAll:   (k) => { _getMSState(k).sel=[]; _updateMS(k); _applyAndRender(); },
    msClear: (k) => { _getMSState(k).sel=[]; _updateMS(k); _applyAndRender(); },
    toggle:  (k, v) => { _msToggle(k, v); _applyAndRender(); },
    goPage:  (p) => { currentPage=p; _renderTable(); },
  };

  _el.querySelectorAll('[data-pag-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      _activeTab = btn.dataset.pagTab;
      _el.querySelectorAll('[data-pag-tab]').forEach(b => b.classList.toggle('active', b.dataset.pagTab === _activeTab));
      ['tab-calendario','tab-carteira'].forEach(t => {
        const el = _el.querySelector(`#pag-${t}`);
        if (el) el.style.display = t === _activeTab ? 'block' : 'none';
      });
    });
  });

  _el.querySelector('#pag-file-input')?.addEventListener('change', e => {
    if (e.target.files[0]) _importFile(e.target.files[0]);
  });

  _el.querySelector('#pag-search-nf')?.addEventListener('input', e => {
    searchNF = e.target.value.trim();
    currentPage = 1;
    _applyAndRender();
  });

  // Multiselects
  ['franqueado','franquia','year'].forEach(k => {
    const btn = _el?.querySelector(`#ms-btn-${k}`);
    btn?.addEventListener('click', (e) => { e.stopPropagation(); _toggleMS(k); });
  });

  document.addEventListener('click', _closeMS);
}

function _closeMS(e) {
  if (!_openMS) return;
  const wrap = _el?.querySelector(`#ms-wrap-${_openMS}`);
  if (wrap && !wrap.contains(e.target)) {
    _el.querySelector(`#ms-drop-${_openMS}`).style.display = 'none';
    _openMS = null;
  }
}

function _getMSState(key) {
  if (key === 'franqueado') return { sel: selFranqueado, set: v => selFranqueado = v };
  if (key === 'franquia')   return { sel: selFranquia,   set: v => selFranquia   = v };
  return                           { sel: selYear,       set: v => selYear       = v };
}

function _msToggle(key, val) {
  const state = _getMSState(key);
  const sel   = state.sel;
  if (sel.includes(val)) state.set(sel.filter(v=>v!==val));
  else { state.set([...sel, val]); }
  _updateMS(key);
}

function _toggleMS(key) {
  const drop = _el?.querySelector(`#ms-drop-${key}`);
  if (!drop) return;
  const isOpen = drop.style.display !== 'none';
  if (_openMS && _openMS !== key) {
    const prev = _el?.querySelector(`#ms-drop-${_openMS}`);
    if (prev) prev.style.display = 'none';
  }
  drop.style.display = isOpen ? 'none' : 'block';
  _openMS = isOpen ? null : key;
}

function _buildMSLists() {
  const franqueados = [...new Set(ALL_DATA.map(r=>r.franqueado||r.grupo_economico||'').filter(Boolean))].sort();
  const franquias   = [...new Set(ALL_DATA.map(r=>r.franquia||r.loja||'').filter(Boolean))].sort();
  const years       = [...new Set(ALL_DATA.map(r=>(r.vencimento||'').substring(0,4)).filter(Boolean))].sort();

  _renderMSList('franqueado', franqueados, selFranqueado);
  _renderMSList('franquia',   franquias,   selFranquia);
  _renderMSList('year',       years,       selYear);
}

function _renderMSList(key, opts, sel) {
  const el = _el?.querySelector(`#ms-list-${key}`);
  if (!el) return;
  el.innerHTML = opts.map(o => `
    <label style="display:flex;align-items:center;gap:8px;padding:7px 12px;font-size:12px;cursor:pointer;border-bottom:1px solid var(--gray-100)">
      <input type="checkbox" ${sel.includes(o)?'checked':''} onchange="window._pag.toggle('${key}','${o}')" style="accent-color:var(--black);cursor:pointer">
      <span>${o}</span>
    </label>
  `).join('');
}

function _updateMS(key) {
  const sel = _getMSState(key).sel;
  const lbl = _el?.querySelector(`#ms-lbl-${key}`);
  if (lbl) lbl.textContent = sel.length === 0 ? (key==='franquia'?'Todas':'Todos') : sel.length <= 2 ? sel.join(', ') : `${sel.length} selecionados`;
}

// ── Import ────────────────────────────────────────────────────

async function _importFile(file) {
  const status = _el?.querySelector('#pag-data-status');
  if (status) status.textContent = 'Processando...';
  try {
    const wb   = await xlsxService.fromFile(file);
    const rows = xlsxService.sheetToJSON(wb, 0);
    ALL_DATA   = rows.map(r => xlsxService.normalizeKeys(r)).filter(r => r.nf || r.nota_fiscal || r.nr_nf);
    if (status) status.textContent = `${formatN(ALL_DATA.length)} parcelas carregadas`;

    const noData = _el?.querySelector('#pag-no-data');
    if (noData) noData.style.display = 'none';

    _buildMSLists();
    _applyAndRender();
  } catch (err) {
    if (status) status.textContent = 'Erro: ' + err.message;
    console.error('[Pagamentos]', err);
  }
}

// ── Filtro e render ───────────────────────────────────────────

function _applyAndRender() {
  const today = new Date();
  filtered = ALL_DATA.filter(r => {
    const fra   = r.franqueado || r.grupo_economico || '';
    const loja  = r.franquia   || r.loja || '';
    const venc  = r.vencimento || '';
    const nf    = String(r.nf || r.nota_fiscal || r.nr_nf || '');
    return (selFranqueado.length===0 || selFranqueado.includes(fra))
        && (selFranquia.length  ===0 || selFranquia.includes(loja))
        && (selYear.length      ===0 || selYear.includes(venc.substring(0,4)))
        && (!searchNF || nf.includes(searchNF));
  });

  currentPage = 1;
  if (_activeTab === 'tab-calendario') _renderCalendario();
  else { _renderKPIs(today); _renderFranqGrid(today); _renderTable(); }
}

function _renderCalendario() {
  const el = _el?.querySelector('#pag-calendar-grid');
  if (!el) return;
  if (!filtered.length) {
    el.innerHTML = '<div class="empty-state" style="padding:60px"><div class="empty-state-title">Nenhum dado para exibir</div><div class="empty-state-sub">Importe uma planilha ou ajuste os filtros.</div></div>';
    return;
  }

  const today = new Date();
  const byMonth = {};
  filtered.forEach(r => {
    const key = (r.vencimento_real || r.vencimento || '').substring(0,7);
    if (!key || key.length < 7) return;
    if (!byMonth[key]) byMonth[key] = { key, total:0, vencido:0, qtd:0 };
    const val = parseFloat(r.valor_atual || r.valor_parcela || r.valor || 0);
    byMonth[key].total += val;
    byMonth[key].qtd++;
    const d = new Date(r.vencimento_real || r.vencimento || '');
    if (!isNaN(d) && d < today) byMonth[key].vencido += val;
  });

  const months = Object.values(byMonth).sort((a,b)=>a.key.localeCompare(b.key));
  el.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px">
      ${months.map(m => {
        const [ano, mes] = m.key.split('-');
        const nomes = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
        const nome  = nomes[parseInt(mes)-1] || mes;
        const vencPct = m.total > 0 ? (m.vencido/m.total*100) : 0;
        return `<div class="card" style="margin-bottom:0">
          <div style="font-size:12px;font-weight:700;color:var(--black);margin-bottom:12px">${nome} ${ano}</div>
          <div style="display:flex;justify-content:space-between;margin-bottom:6px">
            <span style="font-size:11px;color:var(--gray-500)">Total</span>
            <span style="font-size:13px;font-weight:700">${formatBRL(m.total, true)}</span>
          </div>
          ${m.vencido > 0 ? `<div style="display:flex;justify-content:space-between;margin-bottom:6px">
            <span style="font-size:11px;color:var(--red)">Vencido</span>
            <span style="font-size:12px;font-weight:600;color:var(--red)">${formatBRL(m.vencido, true)}</span>
          </div>` : ''}
          <div style="font-size:11px;color:var(--gray-400)">${formatN(m.qtd)} parcelas</div>
          ${m.vencido > 0 ? `<div class="prog-bar" style="margin-top:8px"><div class="prog-fill red" style="width:${vencPct.toFixed(0)}%"></div></div>` : ''}
        </div>`;
      }).join('')}
    </div>
  `;
}

function _renderKPIs(today) {
  const vencidos  = filtered.filter(r => { const d = new Date(r.vencimento_real||r.vencimento||''); return !isNaN(d) && d < today; });
  const aVencer   = filtered.filter(r => { const d = new Date(r.vencimento_real||r.vencimento||''); return !isNaN(d) && d >= today; });
  const sumVencido = vencidos.reduce((s,r)=>s+parseFloat(r.valor_vencido||r.valor_atual||0),0);
  const sumAVencer = aVencer.reduce((s,r)=>s+parseFloat(r.valor_atual||r.valor_parcela||0),0);
  const sumOriginal= filtered.reduce((s,r)=>s+parseFloat(r.valor_original||r.valor_nf||0),0);

  const set = (id, v) => { const el=_el?.querySelector(`#kpi-${id}`); if(el) el.textContent=v; };
  set('qtd-venc',    formatN(vencidos.length));
  set('val-venc',    formatBRL(sumVencido, true));
  set('qtd-avencer', formatN(aVencer.length));
  set('val-avencer', formatBRL(sumAVencer, true));
  set('total',       formatBRL(sumVencido+sumAVencer, true));
  set('original',    formatBRL(sumOriginal, true));
}

function _renderFranqGrid(today) {
  const el = _el?.querySelector('#pag-franq-grid');
  if (!el) return;
  const vencidos = filtered.filter(r => { const d=new Date(r.vencimento_real||r.vencimento||''); return !isNaN(d)&&d<today; });
  const byFranq = {};
  vencidos.forEach(r => {
    const loja = r.franquia||r.loja||'Sem franquia';
    if (!byFranq[loja]) byFranq[loja] = { loja, qtd:0, vencido:0, avencer:0 };
    byFranq[loja].qtd++;
    byFranq[loja].vencido += parseFloat(r.valor_vencido||r.valor_atual||0);
  });
  const sorted = Object.values(byFranq).sort((a,b)=>b.vencido-a.vencido);
  if (!sorted.length) { el.innerHTML='<div style="font-size:13px;color:var(--gray-400);padding:12px 0">Nenhuma franquia com títulos vencidos no período filtrado.</div>'; return; }
  const maxVenc = sorted[0].vencido;
  el.innerHTML = sorted.map(f => `
    <div class="card" style="margin-bottom:0">
      <div style="font-size:13px;font-weight:700;color:var(--black);margin-bottom:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${f.loja}</div>
      <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px">
        <span style="color:var(--gray-500)">Vencido</span>
        <span style="font-weight:700;color:var(--black)">${formatBRL(f.vencido, true)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:8px">
        <span style="color:var(--gray-500)">Parcelas</span>
        <span style="color:var(--gray-600)">${f.qtd}</span>
      </div>
      <div class="prog-bar"><div class="prog-fill" style="width:${maxVenc>0?(f.vencido/maxVenc*100).toFixed(0):0}%"></div></div>
    </div>
  `).join('');
}

function _renderTable() {
  const tbody = _el?.querySelector('#pag-table-body');
  const pagEl = _el?.querySelector('#pag-pagination');
  if (!tbody) return;

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const start = (currentPage-1)*PAGE_SIZE;
  const paged = filtered.slice(start, start+PAGE_SIZE);
  const today = new Date();

  tbody.innerHTML = paged.map(r => {
    const d = new Date(r.vencimento_real||r.vencimento||'');
    const vencido = !isNaN(d) && d < today;
    const dias = !isNaN(d) ? Math.floor((today-d)/(1000*60*60*24)) : null;
    const statusHtml = vencido
      ? `<span style="background:#1a1a1a;color:#fff;border-radius:4px;padding:2px 8px;font-size:11px;font-weight:600">Vencido</span>`
      : `<span style="background:#f2f2f2;color:#555;border-radius:4px;padding:2px 8px;font-size:11px;font-weight:600">A vencer</span>`;
    const diasHtml = vencido && dias !== null
      ? `<span style="background:#1a1a1a;color:#fff;border-radius:4px;padding:2px 8px;font-size:11px;font-weight:600">${dias}d</span>`
      : '<span style="color:#aaa;font-size:11px">—</span>';
    const fmtV = v => v ? formatBRL(parseFloat(v), true) : '—';
    return `<tr style="${vencido?'background:#fafafa':''}">
      <td style="padding:7px 12px;border-bottom:1px solid var(--border-light);font-weight:600">${r.nf||r.nota_fiscal||'—'}</td>
      <td style="padding:7px 12px;border-bottom:1px solid var(--border-light)">${r.franquia||r.loja||'—'}</td>
      <td style="padding:7px 12px;border-bottom:1px solid var(--border-light);color:var(--gray-500)">${r.emissao||r.dt_emissao||'—'}</td>
      <td style="padding:7px 12px;border-bottom:1px solid var(--border-light);color:var(--gray-500)">${r.cond_pgto||r.condicao_pagamento||'—'}</td>
      <td style="padding:7px 12px;border-bottom:1px solid var(--border-light)">${r.vencimento||'—'}</td>
      <td style="padding:7px 12px;border-bottom:1px solid var(--border-light);text-align:right">${fmtV(r.valor_nf||r.valor_total)}</td>
      <td style="padding:7px 12px;border-bottom:1px solid var(--border-light);text-align:right">${r.parcela||'—'}</td>
      <td style="padding:7px 12px;border-bottom:1px solid var(--border-light)">${r.vencimento_real||r.vencimento||'—'}</td>
      <td style="padding:7px 12px;border-bottom:1px solid var(--border-light);text-align:right">${fmtV(r.valor_original)}</td>
      <td style="padding:7px 12px;border-bottom:1px solid var(--border-light);text-align:right;font-weight:600">${fmtV(r.valor_atual||r.valor_parcela)}</td>
      <td style="padding:7px 12px;border-bottom:1px solid var(--border-light);text-align:center">${diasHtml}</td>
      <td style="padding:7px 12px;border-bottom:1px solid var(--border-light);text-align:right;color:var(--red)">${fmtV(r.valor_vencido)}</td>
      <td style="padding:7px 12px;border-bottom:1px solid var(--border-light);text-align:right">${fmtV(r.vencido_mais_vencer)}</td>
      <td style="padding:7px 12px;border-bottom:1px solid var(--border-light)">${statusHtml}</td>
    </tr>`;
  }).join('');

  if (pagEl) {
    pagEl.innerHTML = filtered.length > PAGE_SIZE ? `
      <span style="font-size:12px;color:var(--gray-500)">Pág. ${currentPage} de ${totalPages} (${formatN(filtered.length)} parcelas)</span>
      <button onclick="window._pag.goPage(${currentPage-1})" ${currentPage<=1?'disabled':''} style="padding:5px 12px;background:var(--surface-2);color:var(--gray-700);border:1px solid var(--border);border-radius:4px;font-size:12px;cursor:pointer">‹ Anterior</button>
      <button onclick="window._pag.goPage(${currentPage+1})" ${currentPage>=totalPages?'disabled':''} style="padding:5px 12px;background:var(--surface-2);color:var(--gray-700);border:1px solid var(--border);border-radius:4px;font-size:12px;cursor:pointer">Próxima ›</button>
    ` : '';
  }
}
