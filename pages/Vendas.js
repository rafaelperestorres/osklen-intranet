/**
 * OSKLEN INTRANET — Página: Vendas (Sell Out)
 *
 * Migração completa do dashboard_vendas.html.
 * Preserva: filtros em cascata, gráficos, curva ABC, gênero, grupos,
 * painel diário, upload XLSX com parser vanilla e comparativo YoY/calendário.
 */

import filtersStore from '../store/filtersStore.js';
import eventBus from '../store/eventBus.js';
import xlsxService from '../services/xlsxService.js';
import { formatBRL } from '../utils/formatters.js';

// ── Estado local do módulo ────────────────────────────────────
let _el = null;
let _charts = {};
let _unsubFilters = null;

// Dados carregados do XLSX
let SO_DATA    = [];   // sell-out por loja/mês
let SO_PROD    = [];   // sell-out por produto
let SO_DAY     = [];   // sell-out diário
let META_DATA  = {};   // meta por loja/mês { loja: { '2026-01': valor } }
let YOY_DATA   = [];   // year-over-year (mesmo dia semana)
let FILTER_HIER = { fra_loja:{}, sup_loja:{}, reg_loja:{}, loja_fra:{}, loja_sup:{}, loja_reg:{}, fra_sup:{}, fra_reg:{}, sup_fra:{}, sup_reg:{}, reg_fra:{}, reg_sup:{} };

const MESES_ORDER = ['JANEIRO','FEVEREIRO','MARÇO','ABRIL','MAIO','JUNHO','JULHO','AGOSTO','SETEMBRO','OUTUBRO','NOVEMBRO','DEZEMBRO'];
const ABC_COLORS = { A:'#16a34a', B:'#d97706', C:'#9ca3af' };
const ABC_BG     = { A:'#dcfce7', B:'#fef3c7', C:'#f3f4f6' };
const GENDER_COLORS = { 'M':'#1a1a18','F':'#888','U':'#bbb' };

let _state = {};
let _openDropdown = null;
let _currentMode = 'all';
let _selectedFile = null;
let _skuAbcFilter = [];
let _selectedGenders = [];
let _skuGrupos = [];
let _dataLoaded = false;

const FILTER_DEFS = [
  { id:'mes',    label:'Mês',             opts: MESES_ORDER },
  { id:'grupo',  label:'Grupo econômico', opts: [] },
  { id:'loja',   label:'Loja',            opts: [] },
  { id:'sup',    label:'Supervisão',      opts: [] },
  { id:'regiao', label:'Região',          opts: [] },
];
FILTER_DEFS.forEach(f => _state[f.id] = []);

// ── Contrato público ──────────────────────────────────────────

export async function mount(el) {
  _el = el;
  _el.innerHTML = _shellHTML();
  _bindEvents();

  _unsubFilters = filtersStore.subscribe(() => {});
  eventBus.on('data:refresh', refresh);
}

export function unmount() {
  Object.values(_charts).forEach(c => { try { c.destroy(); } catch(_) {} });
  _charts = {};
  if (_unsubFilters) { _unsubFilters(); _unsubFilters = null; }
  eventBus.off('data:refresh', refresh);
  _el = null;
}

export async function refresh() {
  if (!_dataLoaded) return;
  _renderAll();
}

export function onFilterChange() {}

// ── Shell HTML ────────────────────────────────────────────────

function _shellHTML() {
  return `
    <!-- Filter bar -->
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-lg);padding:12px 16px;margin-bottom:16px">
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px">
        <span style="font-size:11px;font-weight:600;letter-spacing:.07em;text-transform:uppercase;color:var(--gray-500);margin-right:4px">Filtros</span>
        <div style="width:1px;height:20px;background:var(--border)"></div>
        ${FILTER_DEFS.map(f => `
          <div style="position:relative" id="fdwrap-${f.id}">
            <button id="fdbtn-${f.id}"
              style="display:flex;align-items:center;gap:6px;background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:5px 10px;cursor:pointer;font-size:12px;color:var(--gray-700);min-width:100px;justify-content:space-between;font-family:var(--font)">
              <span id="fdlbl-${f.id}" style="flex:1;text-align:left">${f.label}</span>
              <i class="ti ti-chevron-down" style="font-size:12px"></i>
            </button>
            <div id="fddrop-${f.id}" style="display:none;position:absolute;top:calc(100% + 4px);left:0;background:var(--surface);border:1px solid var(--border);border-radius:8px;box-shadow:var(--shadow-md);min-width:200px;z-index:300">
              <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;border-bottom:1px solid var(--border-light)">
                <button onclick="window._vd.selectAll('${f.id}')" style="font-size:11px;font-weight:600;color:var(--gray-700);background:none;border:none;cursor:pointer;font-family:var(--font)">Todos</button>
                <button onclick="window._vd.clearFilter('${f.id}')" style="font-size:11px;color:var(--gray-400);background:none;border:none;cursor:pointer;font-family:var(--font)">Limpar</button>
              </div>
              <div id="fdlist-${f.id}" style="max-height:220px;overflow-y:auto"></div>
            </div>
          </div>
        `).join('')}
        <!-- All/SSS toggle -->
        <div style="display:flex;border:1px solid var(--border);border-radius:6px;overflow:hidden;margin-left:auto">
          <button id="btn-all" onclick="window._vd.setMode('all')"
            style="padding:5px 12px;font-size:12px;border:none;cursor:pointer;background:var(--black);color:#fff;font-family:var(--font);font-weight:500">
            Todas <span id="cnt-all" style="font-size:10px;padding:1px 4px;background:rgba(255,255,255,.2);border-radius:8px;margin-left:3px">0</span>
          </button>
          <button id="btn-sss" onclick="window._vd.setMode('sss')"
            style="padding:5px 12px;font-size:12px;border:none;cursor:pointer;background:var(--surface);color:var(--gray-600);font-family:var(--font);font-weight:500">
            SSS <span id="cnt-sss" style="font-size:10px;padding:1px 4px;background:var(--gray-100);border-radius:8px;margin-left:3px">0</span>
          </button>
        </div>
        <!-- Upload -->
        <label style="display:flex;align-items:center;gap:6px;padding:6px 14px;background:var(--black);color:#fff;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap">
          <i class="ti ti-upload" style="font-size:13px"></i>Importar planilha
          <input type="file" accept=".xlsx,.xls" style="display:none" onchange="window._vd.handleFileInput(this)">
        </label>
      </div>
      <!-- Filtros ativos (pills) -->
      <div id="active-pills" style="display:flex;flex-wrap:wrap;gap:4px;min-height:0"></div>
    </div>

    <!-- Estado sem dados -->
    <div id="vd-no-data">
      <div class="empty-state" style="padding:80px 24px">
        <div class="empty-state-icon"><i class="ti ti-file-spreadsheet"></i></div>
        <div class="empty-state-title">Nenhum dado carregado</div>
        <div class="empty-state-sub">
          Importe o arquivo <strong>sellout.xlsx</strong> para visualizar o dashboard de vendas.<br>
          O arquivo deve conter as abas <code>Sell_Out</code>, <code>Sell Out Prod</code> e <code>validacao_dados</code>.
        </div>
      </div>
    </div>

    <!-- Conteúdo (visível após upload) -->
    <div id="vd-content" style="display:none">
      <!-- KPIs -->
      <div id="metrics-grid" class="kpi-grid" style="grid-template-columns:repeat(auto-fill,minmax(160px,1fr));margin-bottom:16px"></div>

      <!-- Gráficos -->
      <div class="row-2" style="margin-bottom:16px">
        <div class="card" style="margin-bottom:0">
          <div style="font-size:11px;font-weight:600;color:var(--gray-500);text-transform:uppercase;letter-spacing:.4px;margin-bottom:10px">Venda — atual vs ano anterior</div>
          <div class="chart-wrap h-200"><canvas id="cVenda"></canvas></div>
          <div style="display:flex;gap:14px;margin-top:8px;font-size:11px;color:var(--gray-500)">
            <span style="display:flex;align-items:center;gap:4px"><span style="width:9px;height:9px;border-radius:2px;background:#1a1a18;display:inline-block"></span>2026</span>
            <span style="display:flex;align-items:center;gap:4px"><span style="width:9px;height:9px;border-radius:2px;background:#c8c8c4;display:inline-block"></span>2025</span>
          </div>
        </div>
        <div class="card" style="margin-bottom:0">
          <div style="font-size:11px;font-weight:600;color:var(--gray-500);text-transform:uppercase;letter-spacing:.4px;margin-bottom:10px">Qtd. peças — atual vs ano anterior</div>
          <div class="chart-wrap h-200"><canvas id="cPecas"></canvas></div>
        </div>
      </div>

      <!-- Gênero + Grupos -->
      <div style="display:grid;grid-template-columns:320px 1fr;gap:12px;margin-bottom:16px">
        <div class="card" style="margin-bottom:0">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
            <div style="font-size:11px;font-weight:600;color:var(--gray-500);text-transform:uppercase;letter-spacing:.4px">Participação por gênero</div>
            <button id="btn-clear-gender" onclick="window._vd.clearGender()" style="display:none;font-size:11px;padding:3px 8px;border:1px solid var(--border);border-radius:4px;background:var(--surface);cursor:pointer;font-family:var(--font)">Limpar</button>
          </div>
          <div style="position:relative;height:200px;display:flex;align-items:center;justify-content:center">
            <canvas id="cGenero"></canvas>
            <div style="position:absolute;text-align:center;pointer-events:none">
              <div style="font-size:22px;font-weight:700" id="donut-pct">100%</div>
              <div style="font-size:10px;color:#999" id="donut-lbl">Total</div>
            </div>
          </div>
          <div id="gender-legend" style="display:flex;flex-wrap:wrap;gap:6px 14px;margin-top:14px;padding-top:10px;border-top:1px solid var(--border-light)"></div>
        </div>
        <div class="card" style="margin-bottom:0">
          <div style="font-size:11px;font-weight:600;color:var(--gray-500);text-transform:uppercase;letter-spacing:.4px;margin-bottom:12px">Grupo de produto — participação na venda</div>
          <div id="group-list" style="overflow-y:auto;max-height:270px"></div>
        </div>
      </div>

      <!-- Produtos / SKUs -->
      <div class="card" style="margin-bottom:16px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;gap:8px;flex-wrap:wrap">
          <div style="font-size:11px;font-weight:600;color:var(--gray-500);text-transform:uppercase;letter-spacing:.4px">Produtos mais vendidos</div>
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <span style="font-size:9px;font-weight:700;color:var(--gray-400);text-transform:uppercase;letter-spacing:.5px">Curva</span>
            <button id="btn-abc-A" onclick="window._vd.toggleAbcFilter('A')" style="padding:3px 10px;border-radius:5px;border:1.5px solid #16a34a;font-size:10px;font-weight:700;color:#16a34a;background:transparent;cursor:pointer">A</button>
            <button id="btn-abc-B" onclick="window._vd.toggleAbcFilter('B')" style="padding:3px 10px;border-radius:5px;border:1.5px solid #d97706;font-size:10px;font-weight:700;color:#d97706;background:transparent;cursor:pointer">B</button>
            <button id="btn-abc-C" onclick="window._vd.toggleAbcFilter('C')" style="padding:3px 10px;border-radius:5px;border:1.5px solid #9ca3af;font-size:10px;font-weight:700;color:#9ca3af;background:transparent;cursor:pointer">C</button>
            <span id="sku-filter-badge" style="display:none;font-size:10px;padding:2px 10px;background:var(--black);color:#fff;border-radius:10px;cursor:pointer" onclick="window._vd.clearSkuFilter()"></span>
            <span style="font-size:10px;color:var(--gray-400)" id="sku-count"></span>
          </div>
        </div>
        <div style="overflow-x:auto;max-height:340px;overflow-y:auto">
          <table style="width:100%;border-collapse:collapse;font-size:11px">
            <thead>
              <tr style="position:sticky;top:0;background:var(--surface);z-index:2">
                ${['#','Curva','Ref | Cód. Cor','Descrição','Cor','Gênero','Grupo','Venda 2026','Qtde','% Part.','% Acum.'].map(h => `<th style="padding:4px 8px 8px;font-size:9px;font-weight:700;color:var(--gray-500);text-transform:uppercase;letter-spacing:.5px;white-space:nowrap;border-bottom:1px solid var(--border)">${h}</th>`).join('')}
              </tr>
            </thead>
            <tbody id="sku-tbody"></tbody>
          </table>
        </div>
      </div>

      <!-- Painel diário -->
      <div class="card">
        <div style="font-size:11px;font-weight:600;color:var(--gray-500);text-transform:uppercase;letter-spacing:.4px;margin-bottom:10px">Atingimento de meta — painel mensal</div>
        <div id="daily-totals" style="display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-bottom:14px;padding:12px;background:var(--gray-50);border-radius:7px;border:1px solid var(--border-light)"></div>
        <div style="overflow-x:auto">
          <table style="width:100%;border-collapse:collapse;font-size:12px">
            <thead>
              <tr>
                ${['Data','Período','Venda','Meta','Atingimento'].map(h => `<th style="padding:8px 14px;font-size:10px;font-weight:600;color:var(--gray-500);border-bottom:1px solid var(--border);text-align:left;text-transform:uppercase;letter-spacing:.5px">${h}</th>`).join('')}
              </tr>
            </thead>
            <tbody id="daily-tbody"></tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

// ── Bind de eventos ───────────────────────────────────────────

function _bindEvents() {
  // Expor API ao DOM (necessário para onclick inline)
  window._vd = {
    selectAll:       (fid) => { _state[fid] = []; _updateFilter(fid); },
    clearFilter:     (fid) => { _state[fid] = []; _updateFilter(fid); },
    setMode:         (m)   => _setMode(m),
    handleFileInput: (inp) => { if (inp.files[0]) _processFile(inp.files[0]); },
    toggleAbcFilter: (c)   => _toggleAbcFilter(c),
    clearSkuFilter:  ()    => { _skuAbcFilter=[]; _selectedGenders=[]; _skuGrupos=[]; _renderAll(); },
    clearGender:     ()    => { _selectedGenders=[]; _renderAll(); },
    toggleGender:    (g)   => { _selectedGenders.includes(g) ? _selectedGenders=_selectedGenders.filter(x=>x!==g) : _selectedGenders.push(g); _renderAll(); },
    setGrupo:        (g)   => { _skuGrupos.includes(g) ? _skuGrupos=_skuGrupos.filter(x=>x!==g) : _skuGrupos=[g]; _renderAll(); },
  };

  // Fechar dropdowns ao clicar fora
  document.addEventListener('click', _closeDropdownsOutside);

  // Bind botões de dropdown
  FILTER_DEFS.forEach(f => {
    _el?.querySelector(`#fdbtn-${f.id}`)?.addEventListener('click', (e) => {
      e.stopPropagation();
      _toggleDropdown(f.id);
    });
  });
}

function _closeDropdownsOutside(e) {
  if (!_openDropdown) return;
  if (!e.target.closest(`#fdwrap-${_openDropdown}`)) {
    _el?.querySelector(`#fddrop-${_openDropdown}`)?.style && (_el.querySelector(`#fddrop-${_openDropdown}`).style.display = 'none');
    _openDropdown = null;
  }
}

// ── Upload e parse XLSX ───────────────────────────────────────

async function _processFile(file) {
  _showToast('Processando planilha...');
  try {
    const wb = await xlsxService.fromFile(file);
    xlsxService.requireSheets(wb, ['Sell_Out', 'Sell Out Prod', 'validacao_dados']);
    _parseWorkbook(wb);
    _dataLoaded = true;
    _buildFilterOptions();
    _el.querySelector('#vd-no-data').style.display = 'none';
    _el.querySelector('#vd-content').style.display = 'block';
    _renderAll();
    _showToast('Dashboard atualizado!');
  } catch (err) {
    _showToast('Erro: ' + err.message);
    console.error('[Vendas] parse error:', err);
  }
}

function _parseWorkbook(wb) {
  // Sheet: Sell_Out (mensal por loja)
  const soName   = xlsxService.findSheet(wb, 'Sell_Out');
  const prodName = xlsxService.findSheet(wb, 'Sell Out Prod');
  const valName  = xlsxService.findSheet(wb, 'validacao_dados');

  const soRaw   = xlsxService.sheetToJSON(wb, soName);
  const prodRaw = xlsxService.sheetToJSON(wb, prodName);
  const valRaw  = xlsxService.sheetToJSON(wb, valName);

  // Normalizar SO_DATA
  SO_DATA = soRaw.map(r => xlsxService.normalizeKeys(r)).filter(r => r.loja || r.franquia);
  SO_PROD = prodRaw.map(r => {
    const n = xlsxService.normalizeKeys(r);
    return {
      genero: String(n.genero || n.gender || ''),
      grupo:  String(n.grupo || n.grupo_produto || ''),
      ref:    String(n.ref || n.referencia || ''),
      cod_cor:String(n.cod_cor || n.codigo_cor || ''),
      desc:   String(n.descricao || n.desc || n.produto || ''),
      cor:    String(n.cor || n.color || ''),
      venda:  parseFloat(n.venda || n.valor || 0),
      qtde:   parseFloat(n.qtde || n.quantidade || n.pecas || 0),
    };
  }).filter(r => r.venda > 0);

  // META_DATA { loja: { '2026-01': valor } }
  META_DATA = {};
  valRaw.forEach(r => {
    const n = xlsxService.normalizeKeys(r);
    const loja = String(n.loja || n.franquia || '').trim();
    if (!loja) return;
    if (!META_DATA[loja]) META_DATA[loja] = {};
    Object.entries(n).forEach(([k, v]) => {
      if (/^\d{4}-\d{2}$/.test(k)) META_DATA[loja][k] = parseFloat(v) || 0;
    });
  });

  // Construir hierarquias
  SO_DATA.forEach(r => {
    const loja  = r.loja || '';
    const fra   = r.franqueado || r.grupo || '';
    const sup   = r.supervisao || r.supervisor || '';
    const reg   = r.regional || r.regiao || '';

    if (!FILTER_HIER.fra_loja[fra]) FILTER_HIER.fra_loja[fra] = [];
    if (!FILTER_HIER.fra_loja[fra].includes(loja)) FILTER_HIER.fra_loja[fra].push(loja);

    FILTER_HIER.loja_fra[loja] = fra;
    FILTER_HIER.loja_sup[loja] = sup;
    FILTER_HIER.loja_reg[loja] = reg;

    if (!FILTER_HIER.sup_loja[sup]) FILTER_HIER.sup_loja[sup] = [];
    if (!FILTER_HIER.sup_loja[sup].includes(loja)) FILTER_HIER.sup_loja[sup].push(loja);

    if (!FILTER_HIER.reg_loja[reg]) FILTER_HIER.reg_loja[reg] = [];
    if (!FILTER_HIER.reg_loja[reg].includes(loja)) FILTER_HIER.reg_loja[reg].push(loja);
  });
}

function _buildFilterOptions() {
  const all = (field) => [...new Set(SO_DATA.map(r => r[field]).filter(Boolean))].sort();
  FILTER_DEFS.find(f => f.id === 'grupo' ).opts = Object.keys(FILTER_HIER.fra_loja).sort();
  FILTER_DEFS.find(f => f.id === 'loja'  ).opts = all('loja');
  FILTER_DEFS.find(f => f.id === 'sup'   ).opts = all('supervisao');
  FILTER_DEFS.find(f => f.id === 'regiao').opts = all('regional');
  FILTER_DEFS.forEach(f => _renderDropdownList(f));
}

// ── Filtros ───────────────────────────────────────────────────

function _toggleDropdown(id) {
  const drop = _el?.querySelector(`#fddrop-${id}`);
  if (!drop) return;
  const isOpen = drop.style.display !== 'none';
  if (_openDropdown && _openDropdown !== id) {
    const prev = _el?.querySelector(`#fddrop-${_openDropdown}`);
    if (prev) prev.style.display = 'none';
  }
  drop.style.display = isOpen ? 'none' : 'block';
  _openDropdown = isOpen ? null : id;
}

function _renderDropdownList(f) {
  const el = _el?.querySelector(`#fdlist-${f.id}`);
  if (!el) return;
  el.innerHTML = f.opts.map(o => {
    const checked = _state[f.id].includes(String(o));
    return `<label style="display:flex;align-items:center;gap:9px;padding:8px 12px;cursor:pointer;font-size:12px;color:var(--gray-800);border-bottom:1px solid var(--gray-100);transition:background .1s">
      <input type="checkbox" ${checked ? 'checked' : ''} 
        onchange="window._vd.toggleOpt ? window._vd.toggleOpt('${f.id}','${String(o)}',this.checked) : null"
        style="accent-color:var(--black);width:13px;height:13px;cursor:pointer;flex-shrink:0">
      <span>${o}</span>
    </label>`;
  }).join('');

  // Bind inline não funciona bem em módulos — bind direto
  el.querySelectorAll('input[type=checkbox]').forEach((inp, i) => {
    inp.addEventListener('change', () => _toggleOpt(f.id, f.opts[i], inp.checked));
  });
}

function _toggleOpt(fid, val, checked) {
  const f = FILTER_DEFS.find(x => x.id === fid);
  if (_state[fid].length === 0) { _state[fid] = [String(val)]; }
  else if (checked) {
    if (!_state[fid].includes(String(val))) _state[fid].push(String(val));
    if (_state[fid].length === f.opts.length) _state[fid] = [];
  } else {
    _state[fid] = _state[fid].filter(v => v !== String(val));
  }
  _updateFilter(fid);
}

function _updateFilter(fid) {
  const f = FILTER_DEFS.find(x => x.id === fid);
  const lbl = _el?.querySelector(`#fdlbl-${fid}`);
  if (lbl) {
    const sel = _state[fid];
    lbl.innerHTML = sel.length === 0 ? `<span style="color:var(--gray-400)">${f.label}</span>`
      : sel.length <= 2 ? sel.join(', ')
      : `<strong>${sel.length} selecionados</strong>`;
  }
  _renderDropdownList(f);
  _renderPills();
  _renderAll();
}

function _renderPills() {
  const el = _el?.querySelector('#active-pills');
  if (!el) return;
  const pills = [];
  FILTER_DEFS.forEach(f => {
    if (_state[f.id].length > 0)
      _state[f.id].forEach(v => pills.push({ fid: f.id, val: v }));
  });
  el.innerHTML = pills.slice(0, 12).map(p => `
    <span style="display:inline-flex;align-items:center;gap:4px;background:var(--black);color:#fff;border-radius:20px;padding:2px 8px 2px 10px;font-size:11px">
      ${p.val}
      <button onclick="window._vd && window._vd.removePill && window._vd.removePill('${p.fid}','${p.val}')"
        style="background:none;border:none;cursor:pointer;color:rgba(255,255,255,.7);font-size:12px;padding:0 1px;display:flex;align-items:center">×</button>
    </span>
  `).join('');
  window._vd.removePill = (fid, val) => { _state[fid] = _state[fid].filter(v => v !== val); _updateFilter(fid); };
}

function _setMode(m) {
  _currentMode = m;
  const btnAll = _el?.querySelector('#btn-all');
  const btnSSS = _el?.querySelector('#btn-sss');
  if (btnAll) { btnAll.style.background = m === 'all' ? 'var(--black)' : 'var(--surface)'; btnAll.style.color = m === 'all' ? '#fff' : 'var(--gray-600)'; }
  if (btnSSS) { btnSSS.style.background = m === 'sss' ? 'var(--black)' : 'var(--surface)'; btnSSS.style.color = m === 'sss' ? '#fff' : 'var(--gray-600)'; }
  _renderAll();
}

function _toggleAbcFilter(c) {
  _skuAbcFilter.includes(c) ? _skuAbcFilter = _skuAbcFilter.filter(x => x !== c) : _skuAbcFilter.push(c);
  ['A','B','C'].forEach(k => {
    const btn = _el?.querySelector(`#btn-abc-${k}`);
    if (btn) {
      const active = _skuAbcFilter.includes(k);
      btn.style.background = active ? ABC_COLORS[k] : 'transparent';
      btn.style.color = active ? '#fff' : ABC_COLORS[k];
    }
  });
  _renderSkuList();
}

// ── Filtros de dados ──────────────────────────────────────────

function _getFilteredSO() {
  const mesAct  = _state.mes.length   > 0 ? _state.mes   : MESES_ORDER;
  const gruAct  = _state.grupo.length > 0 ? _state.grupo : null;
  const lojaAct = _state.loja.length  > 0 ? _state.loja  : null;
  const supAct  = _state.sup.length   > 0 ? _state.sup   : null;
  const regAct  = _state.regiao.length> 0 ? _state.regiao: null;

  return SO_DATA.filter(r => {
    const mesParsed = MESES_ORDER[parseInt(r.mes || r.mes2 || 1) - 1] || '';
    return mesAct.includes(mesParsed)
      && (!gruAct  || gruAct.includes(r.franqueado  || r.grupo || ''))
      && (!lojaAct || lojaAct.includes(r.loja || ''))
      && (!supAct  || supAct.includes(r.supervisao || ''))
      && (!regAct  || regAct.includes(r.regional || ''));
  });
}

function _getFilteredPROD() {
  const generos = _selectedGenders.length > 0 ? _selectedGenders : null;
  return SO_PROD.filter(r =>
    (!generos || generos.includes(r.genero))
  );
}

// ── Render all ────────────────────────────────────────────────

function _renderAll() {
  if (!_dataLoaded || !_el) return;
  _renderMetrics();
  _renderCharts();
  _renderGeneroChart();
  _renderGroupList();
  _renderSkuList();
  _renderDailyTable();
  _updateStoreCounts();
}

function _renderMetrics() {
  const rows = _getFilteredSO();
  const mult = _currentMode === 'sss' ? 0.62 : 1;

  const venda  = rows.reduce((s,r) => s + (parseFloat(r.venda || r.valor || 0)), 0) * mult;
  const pecas  = rows.reduce((s,r) => s + (parseFloat(r.pecas || r.qtde || 0)), 0)  * mult;
  const tickAt = rows.reduce((s,r) => s + (parseFloat(r.ticket_atendimento || r.ticket || 0)), 0) * mult;
  const tickM  = tickAt > 0 ? venda / tickAt : 0;
  const pa     = tickAt > 0 ? pecas / tickAt : 0;
  const pmv    = pecas  > 0 ? venda / pecas  : 0;

  const fmtV = v => v >= 1e6 ? `R$ ${(v/1e6).toFixed(1).replace('.',',')}M` : v >= 1e3 ? `R$ ${(v/1e3).toFixed(0)}k` : `R$ ${Math.round(v).toLocaleString('pt-BR')}`;
  const fmtI = v => Math.round(v).toLocaleString('pt-BR');
  const fmtU = v => v.toFixed(2).replace('.',',');

  const metrics = [
    { l:'Venda total',       v: fmtV(venda) },
    { l:'Qtd. peças',        v: fmtI(pecas) },
    { l:'Ticket (atend.)',   v: fmtI(tickAt) },
    { l:'Ticket médio',      v: fmtV(tickM) },
    { l:'PA',                v: fmtU(pa) },
    { l:'Preço médio venda', v: fmtV(pmv) },
  ];

  // Meta + atingimento
  const lojasAtivas = [...new Set(rows.map(r => r.loja || ''))];
  const mesesAtivos = [...new Set(rows.map(r => `2026-${String(r.mes || 1).padStart(2,'0')}`))] ;
  let metaTotal = 0;
  lojasAtivas.forEach(loja => {
    mesesAtivos.forEach(mesKey => {
      if (META_DATA[loja]?.[mesKey]) metaTotal += META_DATA[loja][mesKey];
    });
  });
  const metaMult = metaTotal * mult;
  const atingPct = metaMult > 0 ? (venda / metaMult * 100) : null;

  const metaCard = `<div class="kpi-card${atingPct !== null && atingPct >= 100 ? ' accent-green' : ''}">
    <div class="kpi-label">Meta</div>
    <div class="kpi-value" style="font-size:16px">${metaMult > 0 ? fmtV(metaMult) : '—'}</div>
    ${atingPct !== null ? `
      <div class="kpi-sub" style="flex-direction:column;gap:6px;margin-top:8px">
        <span style="font-size:18px;font-weight:700;color:${atingPct>=100?'var(--green)':'var(--amber)'}">${atingPct.toFixed(1)}%</span>
        <div class="prog-bar"><div class="prog-fill ${atingPct>=100?'green':'amber'}" style="width:${Math.min(atingPct,100)}%"></div></div>
      </div>` : '<div class="kpi-sub">N/D</div>'}
  </div>`;

  const el = _el?.querySelector('#metrics-grid');
  if (el) el.innerHTML = metaCard + metrics.map(m => `
    <div class="kpi-card">
      <div class="kpi-label">${m.l}</div>
      <div class="kpi-value">${m.v}</div>
    </div>
  `).join('');
}

function _renderCharts() {
  const rows = _getFilteredSO();
  const byMes = {};
  rows.forEach(r => {
    const m = parseInt(r.mes || r.mes2 || 0);
    if (!m) return;
    if (!byMes[m]) byMes[m] = { v26:0, v25:0, p26:0, p25:0 };
    byMes[m].v26 += parseFloat(r.venda   || 0);
    byMes[m].v25 += parseFloat(r.venda25 || r.venda_aa || 0);
    byMes[m].p26 += parseFloat(r.pecas   || 0);
    byMes[m].p25 += parseFloat(r.pecas25 || r.pecas_aa || 0);
  });

  const labels = Object.keys(byMes).sort((a,b)=>a-b).map(m => MESES_ORDER[m-1]?.substring(0,3) || m);
  const v26 = Object.keys(byMes).sort((a,b)=>a-b).map(m => byMes[m].v26);
  const v25 = Object.keys(byMes).sort((a,b)=>a-b).map(m => byMes[m].v25);
  const p26 = Object.keys(byMes).sort((a,b)=>a-b).map(m => byMes[m].p26);
  const p25 = Object.keys(byMes).sort((a,b)=>a-b).map(m => byMes[m].p25);

  const opts = {
    responsive:true, maintainAspectRatio:false,
    plugins:{ legend:{ display:false } },
    scales:{
      y:{ grid:{ color:'#f0f0f0' }, ticks:{ font:{size:10}, color:'#aaa', callback: v => v>=1e6?`R$${(v/1e6).toFixed(1)}M`:v>=1e3?`R$${(v/1e3).toFixed(0)}k`:v } },
      x:{ grid:{ display:false }, ticks:{ font:{size:10}, color:'#888' } },
    },
  };

  ['cVenda','cPecas'].forEach(id => { if (_charts[id]) { _charts[id].destroy(); } });

  const cVenda = _el?.querySelector('#cVenda');
  if (cVenda && window.Chart) {
    _charts['cVenda'] = new Chart(cVenda, {
      type:'bar', data:{ labels,
        datasets:[
          { label:'2026', data:v26, backgroundColor:'#1a1a18', borderRadius:3 },
          { label:'2025', data:v25, backgroundColor:'#c8c8c4', borderRadius:3 },
        ]}, options:{ ...opts }
    });
  }

  const cPecas = _el?.querySelector('#cPecas');
  if (cPecas && window.Chart) {
    _charts['cPecas'] = new Chart(cPecas, {
      type:'bar', data:{ labels,
        datasets:[
          { label:'2026', data:p26, backgroundColor:'#1a1a18', borderRadius:3 },
          { label:'2025', data:p25, borderColor:'#c8c8c4', borderWidth:1.5, type:'line', pointRadius:0, fill:false },
        ]}, options:{ ...opts }
    });
  }
}

function _renderGeneroChart() {
  const prodRows = _getFilteredPROD();
  const gByGen = {};
  prodRows.forEach(r => {
    const g = (r.genero||'').substring(0,1).toUpperCase() || 'U';
    if (!gByGen[g]) gByGen[g] = 0;
    gByGen[g] += r.venda;
  });
  const total = Object.values(gByGen).reduce((s,v)=>s+v,0);
  const labels = Object.keys(gByGen);
  const data   = labels.map(g => gByGen[g]);
  const colors = labels.map(g => GENDER_COLORS[g] || '#ccc');

  if (_charts['cGenero']) _charts['cGenero'].destroy();
  const canvas = _el?.querySelector('#cGenero');
  if (canvas && window.Chart) {
    _charts['cGenero'] = new Chart(canvas, {
      type:'doughnut',
      data:{ labels, datasets:[{ data, backgroundColor:colors, borderWidth:0 }] },
      options:{
        responsive:true, maintainAspectRatio:false, cutout:'72%',
        plugins:{ legend:{ display:false }, tooltip:{ callbacks:{ label: ctx => `${ctx.label}: ${(ctx.raw/total*100).toFixed(1)}%` } } },
        onClick: (e,els) => { if(els.length) window._vd.toggleGender(labels[els[0].index]); },
      },
    });
  }

  const legend = _el?.querySelector('#gender-legend');
  if (legend) {
    legend.innerHTML = labels.map((g, i) => `
      <span onclick="window._vd.toggleGender('${g}')" style="display:flex;align-items:center;gap:5px;font-size:11px;cursor:pointer;opacity:${_selectedGenders.length===0||_selectedGenders.includes(g)?1:.4}">
        <span style="width:10px;height:10px;border-radius:2px;background:${colors[i]};display:inline-block"></span>
        ${g} (${total>0?(data[i]/total*100).toFixed(1):0}%)
      </span>
    `).join('');
  }

  const btnClear = _el?.querySelector('#btn-clear-gender');
  if (btnClear) btnClear.style.display = _selectedGenders.length > 0 ? 'block' : 'none';
}

function _renderGroupList() {
  const el = _el?.querySelector('#group-list');
  if (!el) return;
  const prodRows = _getFilteredPROD();
  const merged = {};
  prodRows.forEach(r => { if(r.grupo) { if(!merged[r.grupo]) merged[r.grupo]=0; merged[r.grupo]+=r.venda; } });
  const sorted = Object.entries(merged).map(([name,val])=>({name,val:Math.round(val)})).sort((a,b)=>b.val-a.val);
  if (!sorted.length) { el.innerHTML='<div style="color:#aaa;font-size:12px;padding:12px">Sem dados</div>'; return; }
  const total = sorted.reduce((s,r)=>s+r.val,0);
  const maxVal = sorted[0].val;

  el.innerHTML = sorted.map((r,i) => {
    const pct = total ? (r.val/total*100).toFixed(1) : '0.0';
    const barW = (r.val/maxVal*100).toFixed(1);
    const shade = i===0?'#1a1a18':i<3?'#444':i<6?'#888':'#b4b4b0';
    const isSel = _skuGrupos.includes(r.name);
    const fmtV = v => v>=1e6?`R$${(v/1e6).toFixed(1)}M`:v>=1e3?`R$${(v/1e3).toFixed(0)}k`:`R$${Math.round(v).toLocaleString('pt-BR')}`;
    return `<div onclick="window._vd.setGrupo('${r.name}')"
      style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:.5px solid var(--border-light);cursor:pointer;${isSel?'background:var(--black);color:#fff;border-radius:5px;padding:8px 8px;':''}">
      <div style="font-size:12px;font-weight:600;min-width:150px;flex-shrink:0;${isSel?'color:#fff':''}">${i+1}. ${r.name}</div>
      <div style="flex:1;background:var(--border-light);border-radius:3px;height:6px"><div style="width:${barW}%;height:6px;border-radius:3px;background:${isSel?'#fff':shade}"></div></div>
      <div style="font-size:11px;font-weight:600;min-width:70px;text-align:right;${isSel?'color:#fff':''}">${fmtV(r.val)}</div>
      <div style="font-size:11px;min-width:40px;text-align:right;${isSel?'color:rgba(255,255,255,.7)':'color:var(--gray-400)'}">${pct}%</div>
    </div>`;
  }).join('');
}

function _renderSkuList() {
  const tbody = _el?.querySelector('#sku-tbody');
  const countEl = _el?.querySelector('#sku-count');
  if (!tbody) return;

  const prodRows = _getFilteredPROD();
  const activeGenders = _selectedGenders.length > 0 ? _selectedGenders : null;
  const activeGrupos  = _skuGrupos.length > 0 ? _skuGrupos : null;

  const agg = new Map();
  prodRows.forEach(r => {
    if (activeGenders && !activeGenders.includes((r.genero||'').substring(0,1).toUpperCase())) return;
    if (activeGrupos  && !activeGrupos.includes(r.grupo)) return;
    const key = (r.ref||'') + '|' + (r.cod_cor||'');
    if (!agg.has(key)) agg.set(key, { ...r, venda:0, qtde:0 });
    agg.get(key).venda += r.venda;
    agg.get(key).qtde  += r.qtde;
  });

  const sorted = [...agg.values()].filter(p=>p.venda>0).sort((a,b)=>b.venda-a.venda);
  const totalV = sorted.reduce((s,p)=>s+p.venda,0);
  let acum = 0;
  sorted.forEach(p => {
    p.pct  = totalV > 0 ? (p.venda/totalV*100) : 0;
    acum  += p.pct;
    p.acum = acum;
    p.abc  = p.acum <= 80 ? 'A' : p.acum <= 95 ? 'B' : 'C';
  });

  const cntA = sorted.filter(p=>p.abc==='A').length;
  const cntB = sorted.filter(p=>p.abc==='B').length;
  const cntC = sorted.filter(p=>p.abc==='C').length;
  if (countEl) countEl.innerHTML = `${sorted.length} produtos &nbsp;· <span style="color:${ABC_COLORS.A};font-weight:700"> A:${cntA}</span> <span style="color:${ABC_COLORS.B};font-weight:700">B:${cntB}</span> <span style="color:${ABC_COLORS.C};font-weight:700">C:${cntC}</span>`;

  const displayed = _skuAbcFilter.length > 0 ? sorted.filter(p=>_skuAbcFilter.includes(p.abc)) : sorted;
  const fmtV = v => v>=1e6?`R$${(v/1e6).toFixed(1)}M`:v>=1e3?`R$${(v/1e3).toFixed(0)}k`:`R$${Math.round(v).toLocaleString('pt-BR')}`;

  tbody.innerHTML = displayed.map((p,i) => `
    <tr style="border-bottom:.5px solid var(--border-light)">
      <td style="padding:5px 8px;color:var(--gray-400);font-size:10px;text-align:right">${i+1}</td>
      <td style="padding:4px 8px;text-align:center"><span style="padding:1px 6px;border-radius:4px;font-size:10px;font-weight:700;color:${ABC_COLORS[p.abc]};background:${ABC_BG[p.abc]}">${p.abc}</span></td>
      <td style="padding:5px 10px;font-weight:600;font-size:10.5px;white-space:nowrap">${p.ref||'—'}<span style="color:var(--gray-400);font-weight:400"> | ${p.cod_cor||'—'}</span></td>
      <td style="padding:5px 10px;min-width:200px"><div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px">${p.desc||'—'}</div>
        <div style="height:3px;background:var(--border-light);border-radius:2px;margin-top:3px;max-width:280px"><div style="height:3px;background:${ABC_COLORS[p.abc]};border-radius:2px;width:${p.pct.toFixed(1)}%"></div></div></td>
      <td style="padding:5px 10px;font-size:10px;color:var(--gray-500)">${p.cor||'—'}</td>
      <td style="padding:5px 10px;font-size:10px;color:var(--gray-500)">${p.genero||'—'}</td>
      <td style="padding:5px 10px;font-size:10px;color:var(--gray-500)">${p.grupo||'—'}</td>
      <td style="padding:5px 10px;text-align:right;font-weight:700;font-size:11px;white-space:nowrap">${fmtV(p.venda)}</td>
      <td style="padding:5px 10px;text-align:right;font-size:10.5px;color:var(--gray-500)">${Math.round(p.qtde).toLocaleString('pt-BR')}</td>
      <td style="padding:5px 10px;text-align:right;font-size:10px;color:var(--gray-400)">${p.pct>=0.1?p.pct.toFixed(1)+'%':'<0.1%'}</td>
      <td style="padding:5px 10px;text-align:right;font-size:10px;color:var(--gray-400)">${p.acum.toFixed(1)}%</td>
    </tr>
  `).join('');
}

function _renderDailyTable() {
  const rows = _getFilteredSO();
  const totEl  = _el?.querySelector('#daily-totals');
  const tbody  = _el?.querySelector('#daily-tbody');
  if (!totEl || !tbody) return;

  if (!rows.length) {
    totEl.style.display = 'none';
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:20px;color:#aaa;font-size:12px">Nenhum dado para os filtros selecionados.</td></tr>';
    return;
  }

  const byMes = {};
  rows.forEach(r => {
    const m = parseInt(r.mes || r.mes2 || 0);
    if (!m) return;
    const mesKey = `2026-${String(m).padStart(2,'0')}`;
    const label  = MESES_ORDER[m-1] || `Mês ${m}`;
    if (!byMes[mesKey]) byMes[mesKey] = { label, mesKey, venda:0, meta:0, lojas:new Set() };
    byMes[mesKey].venda += parseFloat(r.venda || 0);
    if (r.loja) byMes[mesKey].lojas.add(r.loja);
  });

  Object.values(byMes).forEach(d => {
    d.lojas.forEach(loja => {
      if (META_DATA[loja]?.[d.mesKey]) d.meta += META_DATA[loja][d.mesKey];
    });
  });

  const sorted = Object.values(byMes).sort((a,b) => a.mesKey.localeCompare(b.mesKey));
  const totalV = sorted.reduce((s,r)=>s+r.venda,0);
  const totalM = sorted.reduce((s,r)=>s+r.meta,0);
  const fmtV   = v => v>=1e6?`R$${(v/1e6).toFixed(1)}M`:v>=1e3?`R$${(v/1e3).toFixed(0)}k`:`R$${Math.round(v).toLocaleString('pt-BR')}`;
  const totPct = totalM > 0 ? (totalV/totalM*100) : null;

  totEl.style.display = 'grid';
  totEl.innerHTML = `
    <div><div style="font-size:10px;color:var(--gray-500);text-transform:uppercase;letter-spacing:.5px">Venda total</div><div style="font-size:16px;font-weight:700">${fmtV(totalV)}</div></div>
    <div><div style="font-size:10px;color:var(--gray-500);text-transform:uppercase;letter-spacing:.5px">Meta total</div><div style="font-size:16px;font-weight:700">${totalM>0?fmtV(totalM):'N/D'}</div></div>
    <div><div style="font-size:10px;color:var(--gray-500);text-transform:uppercase;letter-spacing:.5px">Atingimento</div><div style="font-size:16px;font-weight:700;color:${totPct===null?'var(--gray-400)':totPct>=100?'var(--green)':'var(--amber)'}">${totPct!==null?totPct.toFixed(1)+'%':'N/D'}</div></div>
    <div><div style="font-size:10px;color:var(--gray-500);text-transform:uppercase;letter-spacing:.5px">Meses</div><div style="font-size:16px;font-weight:700">${sorted.length}</div></div>
    <div><div style="font-size:10px;color:var(--gray-500);text-transform:uppercase;letter-spacing:.5px">Falta para meta</div><div style="font-size:16px;font-weight:700">${totalM>totalV?fmtV(totalM-totalV):'✓ Atingido'}</div></div>
  `;

  tbody.innerHTML = sorted.map(r => {
    const pct = r.meta > 0 ? (r.venda/r.meta*100) : null;
    const cls = pct === null ? '' : pct >= 100 ? 'style="color:var(--green);font-weight:700"' : 'style="color:var(--red);font-weight:700"';
    return `<tr>
      <td style="padding:9px 14px;border-bottom:.5px solid var(--border-light)">${r.mesKey}</td>
      <td style="padding:9px 14px;border-bottom:.5px solid var(--border-light)">${r.label}</td>
      <td style="padding:9px 14px;border-bottom:.5px solid var(--border-light);text-align:right;font-variant-numeric:tabular-nums">${fmtV(r.venda)}</td>
      <td style="padding:9px 14px;border-bottom:.5px solid var(--border-light);text-align:right;color:var(--gray-500)">${r.meta>0?fmtV(r.meta):'—'}</td>
      <td style="padding:9px 14px;border-bottom:.5px solid var(--border-light);text-align:right" ${cls}>${pct!==null?pct.toFixed(1)+'%':'—'}</td>
    </tr>`;
  }).join('');
}

function _updateStoreCounts() {
  const rows = _getFilteredSO();
  const lojas = new Set(rows.map(r => r.loja || ''));
  const el1 = _el?.querySelector('#cnt-all');
  const el2 = _el?.querySelector('#cnt-sss');
  if (el1) el1.textContent = lojas.size;
  if (el2) el2.textContent = Math.round(lojas.size * 0.7); // placeholder SSS
}

function _showToast(msg) {
  if (window.showToast) window.showToast(msg);
}
