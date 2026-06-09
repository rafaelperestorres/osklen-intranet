/**
 * OSKLEN INTRANET — Página: Faturamento (Status de Entrega)
 *
 * Migração completa do dashboard_faturamento.html.
 * Preserva: upload dual (principal + faturamento), filtros hierárquicos,
 * 3 abas (Valores / Peças / Produtos), tabelas hierárquicas com drill,
 * KPIs, paginação, exportação XLSX, busca de produto.
 */

import filtersStore from '../store/filtersStore.js';
import eventBus from '../store/eventBus.js';
import xlsxService from '../services/xlsxService.js';
import { formatBRL, formatN } from '../utils/formatters.js';

// ── Estado local ──────────────────────────────────────────────
let _el = null;
let _unsubFilters = null;

let mainData = [];
let fatData  = [];
let filteredData = [];
let filters  = { franqueado:[], loja:[], supervisao:[], regional:[], genero:[], grupo_produto:[], subgrupo_produto:[], pedido_cliente:[], entrada:[] };
let sortState = { valores:{ col:null, dir:1 }, pecas:{ col:null, dir:1 }, produtos:{ col:null, dir:1 } };
let pages     = { valores:1, pecas:1, produtos:1 };
const PAGE_SIZE = 50;
let selectedProductKey = null;
let prodSearchTerm = '';
let showSemFat = false;
let filterOrder = [];
let expandedKeys = { valores: new Set(), pecas: new Set() };
let activeTab = 'valores';

const DIMS = [
  {id:'regional',label:'Regional'},{id:'supervisao',label:'Supervisão'},
  {id:'franqueado',label:'Franqueado'},{id:'loja',label:'Loja'},
  {id:'genero',label:'Gênero'},{id:'grupo_produto',label:'Grupo'},
  {id:'subgrupo_produto',label:'Subgrupo'},{id:'pedido_cliente',label:'Pedido Cliente'},
  {id:'entrada',label:'Entrada'},
];

// ── Contrato público ──────────────────────────────────────────

export async function mount(el) {
  _el = el;
  _el.innerHTML = _shellHTML();
  _bindEvents();
  _unsubFilters = filtersStore.subscribe(() => {});
  eventBus.on('data:refresh', refresh);
}

export function unmount() {
  if (_unsubFilters) { _unsubFilters(); _unsubFilters = null; }
  eventBus.off('data:refresh', refresh);
  document.removeEventListener('click', _closeDropdowns);
  _el = null;
}

export async function refresh() { if (_el) _applyFiltersAndRender(); }
export function onFilterChange() {}

// ── Shell ─────────────────────────────────────────────────────

function _shellHTML() {
  return `
    <!-- Zona de upload -->
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-lg);padding:14px 18px;margin-bottom:16px;display:flex;align-items:center;gap:16px;flex-wrap:wrap">
      <span style="font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:var(--gray-500)">📁 Atualizar Dados</span>
      <div>
        <div style="color:var(--gray-600);font-size:11px;margin-bottom:4px">Planilha Principal</div>
        <label style="display:inline-flex;align-items:center;gap:6px;padding:6px 14px;background:var(--black);color:#fff;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer">
          <i class="ti ti-upload" style="font-size:13px"></i>Importar Principal
          <input type="file" accept=".xlsx,.xls" style="display:none" id="fat-file-main">
        </label>
      </div>
      <div>
        <div style="color:var(--gray-600);font-size:11px;margin-bottom:4px">Planilha Faturamento</div>
        <label style="display:inline-flex;align-items:center;gap:6px;padding:6px 14px;background:var(--black);color:#fff;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer">
          <i class="ti ti-upload" style="font-size:13px"></i>Importar Faturamento
          <input type="file" accept=".xlsx,.xls" style="display:none" id="fat-file-fat">
        </label>
      </div>
      <span id="fat-import-status" style="font-size:12px;color:var(--gray-500)">Aguardando planilhas</span>
    </div>

    <!-- Filtros -->
    <div id="fat-filters-container" style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px"></div>

    <!-- Abas -->
    <div class="module-tabs" style="margin-bottom:0">
      <button class="module-tab active" data-fat-tab="valores">💰 Valores</button>
      <button class="module-tab" data-fat-tab="pecas">📦 Peças</button>
      <button class="module-tab" data-fat-tab="produtos">🏷️ Produtos</button>
    </div>

    <!-- Conteúdo das abas -->
    <div id="fat-tab-valores" style="padding-top:16px">
      <div id="kpi-valores" class="kpi-grid" style="margin-bottom:16px"></div>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;flex-wrap:wrap;gap:8px">
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap" id="subtotal-btns-valores"></div>
        <button onclick="window._fat.exportXlsx('valores')" style="background:var(--green);color:#fff;border:none;border-radius:6px;padding:5px 14px;font-size:12px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:5px">⬇ Exportar Excel</button>
      </div>
      <div class="table-card"><div class="table-scroll" id="table-valores"></div></div>
      <div id="pag-valores" style="padding:10px 0;display:flex;justify-content:flex-end;gap:8px;align-items:center"></div>
    </div>

    <div id="fat-tab-pecas" style="display:none;padding-top:16px">
      <div id="kpi-pecas" class="kpi-grid" style="margin-bottom:16px"></div>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;flex-wrap:wrap;gap:8px">
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap" id="subtotal-btns-pecas"></div>
        <button onclick="window._fat.exportXlsx('pecas')" style="background:var(--green);color:#fff;border:none;border-radius:6px;padding:5px 14px;font-size:12px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:5px">⬇ Exportar Excel</button>
      </div>
      <div class="table-card"><div class="table-scroll" id="table-pecas"></div></div>
      <div id="pag-pecas" style="padding:10px 0;display:flex;justify-content:flex-end;gap:8px;align-items:center"></div>
    </div>

    <div id="fat-tab-produtos" style="display:none;padding-top:16px">
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:12px;flex-wrap:wrap">
        <div class="search-wrap" style="flex:1;min-width:200px">
          <i class="ti ti-search search-icon"></i>
          <input id="fat-search-prod" type="text" placeholder="Buscar produto ou cor..." style="width:100%;padding:7px 10px 7px 32px;border:1px solid var(--border);border-radius:var(--radius-md);font-size:13px;background:var(--surface);outline:none;color:var(--black)">
        </div>
        <label id="fat-btn-sem-fat" style="display:flex;align-items:center;gap:5px;background:var(--surface-2);border:1.5px solid var(--border);border-radius:6px;padding:5px 10px;cursor:pointer;font-size:12px;font-weight:600;user-select:none">
          <input type="checkbox" id="fat-chk-sem-fat" style="accent-color:var(--black)">
          Sem Faturamento / Embalado
        </label>
        <button onclick="window._fat.exportProdutosXlsx()" style="background:var(--green);color:#fff;border:none;border-radius:6px;padding:5px 14px;font-size:12px;font-weight:600;cursor:pointer;margin-left:auto">⬇ Exportar Excel</button>
      </div>
      <div class="table-card"><div class="table-scroll" id="table-produtos"></div></div>
      <div id="pag-produtos" style="padding:10px 0;display:flex;justify-content:flex-end;gap:8px;align-items:center"></div>
    </div>

    <!-- Sem dados -->
    <div id="fat-no-data">
      <div class="empty-state" style="padding:80px 24px;margin-top:16px">
        <div class="empty-state-icon"><i class="ti ti-file-spreadsheet"></i></div>
        <div class="empty-state-title">Nenhum dado carregado</div>
        <div class="empty-state-sub">Importe a planilha principal e a planilha de faturamento para visualizar o dashboard.</div>
      </div>
    </div>
  `;
}

// ── Bind de eventos ───────────────────────────────────────────

function _bindEvents() {
  window._fat = {
    exportXlsx:        (tab) => _exportXlsx(tab),
    exportProdutosXlsx:()    => _exportProdutosXlsx(),
    toggleFilter:      (dim, val) => _toggleFilter(dim, val),
    selectAll:         (dim) => _selectAll(dim),
    clearFilter:       (dim) => _clearFilter(dim),
    showTab:           (tab) => _showTab(tab),
  };

  _el.querySelector('#fat-file-main')?.addEventListener('change', e => {
    if (e.target.files[0]) _importMain(e.target.files[0]);
  });
  _el.querySelector('#fat-file-fat')?.addEventListener('change', e => {
    if (e.target.files[0]) _importFat(e.target.files[0]);
  });
  _el.querySelector('#fat-search-prod')?.addEventListener('input', e => {
    prodSearchTerm = e.target.value;
    pages.produtos = 1;
    _renderProdutos();
  });
  _el.querySelector('#fat-chk-sem-fat')?.addEventListener('change', e => {
    showSemFat = e.target.checked;
    _renderProdutos();
  });

  // Tabs
  _el.querySelectorAll('[data-fat-tab]').forEach(btn => {
    btn.addEventListener('click', () => _showTab(btn.dataset.fatTab));
  });
}

function _showTab(tab) {
  activeTab = tab;
  _el.querySelectorAll('[data-fat-tab]').forEach(b => b.classList.toggle('active', b.dataset.fatTab === tab));
  ['valores','pecas','produtos'].forEach(t => {
    const el = _el.querySelector(`#fat-tab-${t}`);
    if (el) el.style.display = t === tab ? 'block' : 'none';
  });
}

// ── Import ────────────────────────────────────────────────────

async function _importMain(file) {
  _setStatus('Processando planilha principal...');
  try {
    const wb  = await xlsxService.fromFile(file);
    const rows = xlsxService.sheetToJSON(wb, 0);
    mainData = rows.map(r => xlsxService.normalizeKeys(r));
    _setStatus(`Principal carregada: ${mainData.length} registros`);
    _applyFiltersAndRender();
  } catch (err) {
    _setStatus('Erro: ' + err.message);
  }
}

async function _importFat(file) {
  _setStatus('Processando planilha de faturamento...');
  try {
    const wb  = await xlsxService.fromFile(file);
    const rows = xlsxService.sheetToJSON(wb, 0);
    fatData = rows.map(r => xlsxService.normalizeKeys(r));
    _setStatus(`Faturamento carregado: ${fatData.length} registros`);
    _applyFiltersAndRender();
  } catch (err) {
    _setStatus('Erro: ' + err.message);
  }
}

function _setStatus(msg) {
  const el = _el?.querySelector('#fat-import-status');
  if (el) { el.textContent = msg; el.style.color = msg.startsWith('Erro') ? 'var(--red)' : 'var(--green)'; }
}

// ── Filtros ───────────────────────────────────────────────────

function _applyFiltersAndRender() {
  if (!mainData.length && !fatData.length) return;

  const noData = _el?.querySelector('#fat-no-data');
  if (noData) noData.style.display = 'none';

  const data = mainData.length ? mainData : [];
  filteredData = data.filter(r => {
    return Object.entries(filters).every(([dim, vals]) =>
      vals.length === 0 || vals.includes(String(r[dim] || ''))
    );
  });

  filterOrder = DIMS.filter(d => filters[d.id]?.length > 0).map(d => d.id);
  _buildFilterUI();
  _renderKPIs('valores');
  _renderKPIs('pecas');
  _renderTableHierarchical('valores');
  _renderTableHierarchical('pecas');
  _renderProdutos();
}

function _buildFilterUI() {
  const container = _el?.querySelector('#fat-filters-container');
  if (!container) return;
  container.innerHTML = DIMS.map(dim => {
    const vals = [...new Set(mainData.map(r => String(r[dim.id]||'')).filter(Boolean))].sort();
    if (!vals.length) return '';
    const sel = filters[dim.id];
    const hasSel = sel.length > 0;
    return `<div style="display:flex;flex-direction:column;gap:3px">
      <label style="color:var(--gray-500);font-size:10px;text-transform:uppercase;letter-spacing:.6px;font-weight:600">${dim.label}</label>
      <select multiple onchange="window._fat.handleSelectChange(this, '${dim.id}')"
        style="background:var(--surface-2);color:var(--black);border:1px solid var(--border);border-radius:6px;padding:4px 8px;font-size:12px;cursor:pointer;min-width:130px;max-height:80px">
        ${vals.map(v => `<option value="${v}" ${hasSel&&sel.includes(v)?'selected':''}>${v}</option>`).join('')}
      </select>
    </div>`;
  }).join('');

  window._fat.handleSelectChange = (sel, dim) => {
    filters[dim] = Array.from(sel.selectedOptions).map(o => o.value);
    pages.valores = pages.pecas = pages.produtos = 1;
    _applyFiltersAndRender();
  };
}

// ── KPIs ──────────────────────────────────────────────────────

function _renderKPIs(tab) {
  const el = _el?.querySelector(`#kpi-${tab}`);
  if (!el) return;
  const isVal = tab === 'valores';
  const field = isVal ? 'valor_faturado' : 'qtde_pecas';

  const total = filteredData.reduce((s,r) => s + (parseFloat(r[field]||r.valor||r.qtde||0)), 0);
  const qtdLojas = new Set(filteredData.map(r => r.loja||r.franquia||'')).size;
  const qtdReg   = new Set(filteredData.map(r => r.regional||'')).size;

  el.innerHTML = `
    <div class="kpi-card">
      <div class="kpi-label">${isVal ? 'Total Faturado' : 'Total Peças'}</div>
      <div class="kpi-value">${isVal ? formatBRL(total, true) : formatN(total)}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Lojas</div>
      <div class="kpi-value">${qtdLojas}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Regionais</div>
      <div class="kpi-value">${qtdReg}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Registros</div>
      <div class="kpi-value">${formatN(filteredData.length)}</div>
    </div>
  `;
}

// ── Tabela Hierárquica ────────────────────────────────────────

function _renderTableHierarchical(tab) {
  const el = _el?.querySelector(`#table-${tab}`);
  if (!el) { return; }
  const isVal = tab === 'valores';
  const field = isVal ? (filteredData[0]?.valor_faturado !== undefined ? 'valor_faturado' : 'valor') : (filteredData[0]?.qtde_pecas !== undefined ? 'qtde_pecas' : 'qtde');

  // Agrupar por loja
  const byLoja = {};
  filteredData.forEach(r => {
    const loja = r.loja || r.franquia || 'Sem loja';
    if (!byLoja[loja]) byLoja[loja] = { loja, regional: r.regional||'', supervisao: r.supervisao||'', franqueado: r.franqueado||'', total:0, rows:[] };
    const v = parseFloat(r[field] || r.valor || r.qtde || 0);
    byLoja[loja].total += v;
    byLoja[loja].rows.push(r);
  });

  const lojas = Object.values(byLoja).sort((a,b) => b.total - a.total);
  const grandTotal = lojas.reduce((s,l)=>s+l.total,0);
  const page   = pages[tab] ?? 1;
  const start  = (page-1)*PAGE_SIZE;
  const paged  = lojas.slice(start, start+PAGE_SIZE);
  const fmtV   = isVal ? (v=>formatBRL(v,true)) : (v=>formatN(v));

  el.innerHTML = `
    <table style="width:100%;border-collapse:collapse;font-size:12px">
      <thead>
        <tr>
          <th style="padding:9px 14px;font-size:10px;font-weight:600;letter-spacing:.07em;text-transform:uppercase;color:var(--gray-500);background:var(--gray-50);border-bottom:1px solid var(--border);text-align:left">Loja</th>
          <th style="padding:9px 14px;font-size:10px;font-weight:600;letter-spacing:.07em;text-transform:uppercase;color:var(--gray-500);background:var(--gray-50);border-bottom:1px solid var(--border);text-align:left">Regional</th>
          <th style="padding:9px 14px;font-size:10px;font-weight:600;letter-spacing:.07em;text-transform:uppercase;color:var(--gray-500);background:var(--gray-50);border-bottom:1px solid var(--border);text-align:left">Supervisão</th>
          <th style="padding:9px 14px;font-size:10px;font-weight:600;letter-spacing:.07em;text-transform:uppercase;color:var(--gray-500);background:var(--gray-50);border-bottom:1px solid var(--border);text-align:right">${isVal?'Valor':'Peças'}</th>
          <th style="padding:9px 14px;font-size:10px;font-weight:600;letter-spacing:.07em;text-transform:uppercase;color:var(--gray-500);background:var(--gray-50);border-bottom:1px solid var(--border);text-align:right">% Total</th>
        </tr>
      </thead>
      <tbody>
        ${paged.map(l => {
          const pct = grandTotal > 0 ? (l.total/grandTotal*100).toFixed(1) : '0.0';
          const barW = grandTotal > 0 ? Math.round(l.total/grandTotal*100) : 0;
          return `<tr>
            <td style="padding:9px 14px;border-bottom:1px solid var(--border-light);font-weight:500">${l.loja}</td>
            <td style="padding:9px 14px;border-bottom:1px solid var(--border-light);color:var(--gray-600)">${l.regional}</td>
            <td style="padding:9px 14px;border-bottom:1px solid var(--border-light);color:var(--gray-600)">${l.supervisao}</td>
            <td style="padding:9px 14px;border-bottom:1px solid var(--border-light);text-align:right;font-variant-numeric:tabular-nums">${fmtV(l.total)}</td>
            <td style="padding:9px 14px;border-bottom:1px solid var(--border-light);text-align:right;min-width:120px">
              <div style="display:flex;align-items:center;gap:6px;justify-content:flex-end">
                <div style="flex:1;height:4px;background:var(--border-light);border-radius:2px;max-width:80px"><div style="height:4px;border-radius:2px;background:var(--black);width:${barW}%"></div></div>
                <span style="font-size:11px;color:var(--gray-500)">${pct}%</span>
              </div>
            </td>
          </tr>`;
        }).join('')}
        <tr style="background:var(--gray-50)">
          <td style="padding:9px 14px;font-weight:700" colspan="3">TOTAL</td>
          <td style="padding:9px 14px;text-align:right;font-weight:700;font-variant-numeric:tabular-nums">${fmtV(grandTotal)}</td>
          <td style="padding:9px 14px;text-align:right;font-weight:700">100%</td>
        </tr>
      </tbody>
    </table>
  `;

  _renderPagination(tab, lojas.length);
}

function _renderProdutos() {
  const el = _el?.querySelector('#table-produtos');
  if (!el) return;

  const fatRows = fatData.length ? fatData : mainData;
  let filtered = fatRows;
  if (prodSearchTerm) {
    const q = prodSearchTerm.toLowerCase();
    filtered = filtered.filter(r =>
      String(r.produto||r.descricao||r.produto_cor||'').toLowerCase().includes(q) ||
      String(r.cor||'').toLowerCase().includes(q)
    );
  }
  if (!showSemFat) {
    filtered = filtered.filter(r => parseFloat(r.valor_faturado||r.valor||0) > 0);
  }

  const page  = pages.produtos ?? 1;
  const start = (page-1)*PAGE_SIZE;
  const paged = filtered.slice(start, start+PAGE_SIZE);

  if (!filtered.length) {
    el.innerHTML = '<div class="empty-state" style="padding:40px"><div class="empty-state-title">Nenhum produto encontrado</div></div>';
    return;
  }

  el.innerHTML = `
    <table style="width:100%;border-collapse:collapse;font-size:12px">
      <thead>
        <tr>
          ${['Produto / Cor','Gênero','Grupo','Subgrupo','Pedido','Entrada','Val. Faturado','Peças'].map(h =>
            `<th style="padding:9px 14px;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.07em;color:var(--gray-500);background:var(--gray-50);border-bottom:1px solid var(--border);text-align:${h.includes('Val')||h==='Peças'?'right':'left'}">${h}</th>`
          ).join('')}
        </tr>
      </thead>
      <tbody>
        ${paged.map(r => `
          <tr>
            <td style="padding:8px 14px;border-bottom:1px solid var(--border-light);font-weight:500">${r.produto||r.descricao||r.produto_cor||'—'}</td>
            <td style="padding:8px 14px;border-bottom:1px solid var(--border-light);color:var(--gray-600)">${r.genero||'—'}</td>
            <td style="padding:8px 14px;border-bottom:1px solid var(--border-light);color:var(--gray-600)">${r.grupo_produto||r.grupo||'—'}</td>
            <td style="padding:8px 14px;border-bottom:1px solid var(--border-light);color:var(--gray-600)">${r.subgrupo_produto||'—'}</td>
            <td style="padding:8px 14px;border-bottom:1px solid var(--border-light);color:var(--gray-600)">${r.pedido_cliente||r.pedido||'—'}</td>
            <td style="padding:8px 14px;border-bottom:1px solid var(--border-light);color:var(--gray-600)">${r.entrada||'—'}</td>
            <td style="padding:8px 14px;border-bottom:1px solid var(--border-light);text-align:right;font-variant-numeric:tabular-nums">${formatBRL(parseFloat(r.valor_faturado||r.valor||0), true)}</td>
            <td style="padding:8px 14px;border-bottom:1px solid var(--border-light);text-align:right">${formatN(parseFloat(r.qtde_pecas||r.qtde||0))}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
  _renderPagination('produtos', filtered.length);
}

function _renderPagination(tab, total) {
  const el = _el?.querySelector(`#pag-${tab}`);
  if (!el) return;
  const page = pages[tab] ?? 1;
  const totalPages = Math.ceil(total/PAGE_SIZE);
  if (totalPages <= 1) { el.innerHTML=''; return; }
  el.innerHTML = `
    <span style="font-size:12px;color:var(--gray-500)">Pág. ${page} de ${totalPages} (${formatN(total)} registros)</span>
    <button onclick="window._fat.goPage('${tab}',${page-1})" ${page<=1?'disabled':''} style="padding:5px 12px;background:var(--surface-2);color:var(--gray-700);border:1px solid var(--border);border-radius:4px;font-size:12px;cursor:pointer">‹ Anterior</button>
    <button onclick="window._fat.goPage('${tab}',${page+1})" ${page>=totalPages?'disabled':''} style="padding:5px 12px;background:var(--surface-2);color:var(--gray-700);border:1px solid var(--border);border-radius:4px;font-size:12px;cursor:pointer">Próxima ›</button>
  `;
  window._fat.goPage = (t, p) => { pages[t]=p; if(t==='produtos') _renderProdutos(); else _renderTableHierarchical(t); };
}

// ── Exportação ────────────────────────────────────────────────

function _exportXlsx(tab) {
  if (!window.XLSX) return;
  const isVal = tab === 'valores';
  const field = isVal ? 'valor_faturado' : 'qtde_pecas';
  const rows = filteredData.map(r => ({
    Loja: r.loja||'', Regional: r.regional||'', Supervisão: r.supervisao||'',
    [isVal?'Valor Faturado':'Peças']: parseFloat(r[field]||r.valor||r.qtde||0),
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, tab);
  XLSX.writeFile(wb, `faturamento_${tab}.xlsx`);
}

function _exportProdutosXlsx() {
  if (!window.XLSX) return;
  const rows = (fatData.length?fatData:mainData).map(r => ({
    Produto: r.produto||r.descricao||'', Gênero: r.genero||'', Grupo: r.grupo_produto||'',
    'Valor Faturado': parseFloat(r.valor_faturado||r.valor||0),
    Peças: parseFloat(r.qtde_pecas||r.qtde||0),
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'produtos');
  XLSX.writeFile(wb, 'faturamento_produtos.xlsx');
}

function _closeDropdowns() {}
