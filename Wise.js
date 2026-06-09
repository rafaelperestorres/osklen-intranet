/**
 * OSKLEN INTRANET — Página: Dashboard Wise
 *
 * Migração completa do dashboard_wise.html.
 * Preserva: upload de planilha WISE/PORT/META, abas Visão Geral/Franquias/Produtos/Importar,
 * KPIs, gráficos (grupos, ranking, meta), tabelas com busca e filtro.
 */

import filtersStore from '../store/filtersStore.js';
import eventBus from '../store/eventBus.js';
import xlsxService from '../services/xlsxService.js';
import { formatBRL, formatN, formatPct } from '../utils/formatters.js';

// ── Estado ────────────────────────────────────────────────────
let _el = null;
let _charts = {};
let _unsubFilters = null;
let _activeTab = 'visao-geral';
let _pendingImport = null;
let _filterFranquia = '';
let _filterGrupo = '';
let _filterGenero = '';

let DATA = {
  total_faturamento: 0, total_meta: 0, total_atingimento: 0, total_qtd: 0,
  franquias: [], produtos: [], grupos: [], pedidos: {},
};

const fmt  = v => formatBRL(v, true);
const fmtN = v => formatN(v);
const pct  = v => formatPct(v);
const progColor = p => p >= 100 ? '#1a6b3c' : p >= 80 ? '#7a5500' : '#b03030';

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

export async function refresh() { if (_el) _renderActiveTab(); }
export function onFilterChange() {}

// ── Shell ─────────────────────────────────────────────────────

function _shellHTML() {
  const tabs = [
    { id:'visao-geral', label:'Visão Geral' },
    { id:'franquias',   label:'Franquias' },
    { id:'produtos',    label:'Produtos' },
    { id:'importar',    label:'Importar' },
  ];
  return `
    <div class="module-tabs">
      ${tabs.map(t => `<button class="module-tab${t.id===_activeTab?' active':''}" data-wise-tab="${t.id}">${t.label}</button>`).join('')}
    </div>
    <div id="wise-pane" style="padding-top:4px" class="fade-in"></div>
  `;
}

function _bindEvents() {
  _el.querySelectorAll('[data-wise-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      _activeTab = btn.dataset.wiseTab;
      _el.querySelectorAll('[data-wise-tab]').forEach(b => b.classList.toggle('active', b.dataset.wiseTab === _activeTab));
      _renderActiveTab();
    });
  });
  _renderActiveTab();
}

function _renderActiveTab() {
  const pane = _el?.querySelector('#wise-pane');
  if (!pane) return;
  pane.className = 'fade-in';
  switch (_activeTab) {
    case 'visao-geral': _renderVisaoGeral(pane); break;
    case 'franquias':   _renderFranquias(pane); break;
    case 'produtos':    _renderProdutos(pane); break;
    case 'importar':    _renderImportar(pane); break;
  }
}

// ── Aba: Visão Geral ──────────────────────────────────────────

function _renderVisaoGeral(pane) {
  const d = DATA;
  pane.innerHTML = `
    <div id="wise-kpis" class="kpi-grid" style="margin-bottom:24px"></div>
    <div class="row-2">
      <div class="card" style="margin-bottom:0">
        <div class="card-header"><div class="card-title">Faturamento por grupo</div></div>
        <div class="chart-wrap h-280"><canvas id="wise-chart-grupos"></canvas></div>
      </div>
      <div class="card" style="margin-bottom:0">
        <div class="card-header"><div class="card-title">Top 10 franquias</div><span style="font-size:12px;color:var(--gray-500)">por faturamento</span></div>
        <div class="chart-wrap h-280"><canvas id="wise-chart-ranking"></canvas></div>
      </div>
    </div>
    <div class="card" style="margin-top:16px">
      <div class="card-header"><div class="card-title">Atingimento de meta por franquia</div></div>
      <div class="chart-wrap h-420"><canvas id="wise-chart-meta"></canvas></div>
    </div>
  `;
  _renderKPIs();
  _buildCharts();
}

function _renderKPIs() {
  const d = DATA;
  const el = _el?.querySelector('#wise-kpis');
  if (!el) return;
  const badge = d.total_atingimento >= 100 ? 'badge-green' : d.total_atingimento >= 80 ? 'badge-amber' : 'badge-red';
  el.innerHTML = `
    <div class="kpi-card">
      <div class="kpi-label">Faturamento</div>
      <div class="kpi-value">${fmt(d.total_faturamento)}</div>
      <div class="kpi-sub"><span class="badge ${badge}">${pct(d.total_atingimento)} da meta</span></div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Meta</div>
      <div class="kpi-value">${fmt(d.total_meta)}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Qtd. peças</div>
      <div class="kpi-value">${fmtN(d.total_qtd)}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Franquias</div>
      <div class="kpi-value">${d.franquias.length}</div>
    </div>
  `;
}

function _buildCharts() {
  if (!window.Chart) return;
  const d = DATA;

  // Chart grupos
  ['wise-chart-grupos','wise-chart-ranking','wise-chart-meta'].forEach(id => {
    if (_charts[id]) { _charts[id].destroy(); delete _charts[id]; }
  });

  const cGrupos = _el?.querySelector('#wise-chart-grupos');
  if (cGrupos && d.grupos.length) {
    _charts['wise-chart-grupos'] = new Chart(cGrupos, {
      type:'doughnut',
      data:{ labels: d.grupos.map(g=>g.grupo), datasets:[{ data: d.grupos.map(g=>g.faturamento), backgroundColor:['#111','#444','#777','#999','#bbb','#ddd'], borderWidth:0 }] },
      options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ position:'right', labels:{ font:{size:11}, color:'#444' } }, tooltip:{ callbacks:{ label: ctx => `${ctx.label}: ${fmt(ctx.raw)}` } } } },
    });
  }

  const top10 = [...d.franquias].slice(0,10);
  const cRanking = _el?.querySelector('#wise-chart-ranking');
  if (cRanking && top10.length) {
    _charts['wise-chart-ranking'] = new Chart(cRanking, {
      type:'bar',
      data:{ labels: top10.map(f=>f.franquia.replace('FRANQUIA /','')), datasets:[{ data: top10.map(f=>f.faturamento), backgroundColor:'#111', borderRadius:3 }] },
      options:{ responsive:true, maintainAspectRatio:false, indexAxis:'y', plugins:{ legend:{display:false}, tooltip:{callbacks:{label:ctx=>fmt(ctx.raw)}} }, scales:{ x:{ grid:{color:'#f0f0f0'}, ticks:{callback:v=>fmt(v),font:{size:9},color:'#aaa'} }, y:{ grid:{display:false}, ticks:{font:{size:10},color:'#555'} } } },
    });
  }

  const cMeta = _el?.querySelector('#wise-chart-meta');
  if (cMeta && d.franquias.length) {
    const franqs = d.franquias.filter(f=>f.meta>0);
    _charts['wise-chart-meta'] = new Chart(cMeta, {
      type:'bar',
      data:{ labels: franqs.map(f=>f.franquia.replace('FRANQUIA /','').substring(0,20)), datasets:[
        { label:'Atingimento', data: franqs.map(f=>f.atingimento), backgroundColor: franqs.map(f=>f.atingimento>=100?'#1a6b3c':f.atingimento>=80?'#7a5500':'#b03030'), borderRadius:3 },
        { label:'Meta (100%)', data: franqs.map(()=>100), type:'line', borderColor:'#888', borderWidth:1.5, borderDash:[4,4], pointRadius:0, fill:false },
      ]},
      options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{display:false}, tooltip:{callbacks:{label:ctx=>ctx.datasetIndex===0?`${ctx.raw.toFixed(1)}%`:'Meta 100%'}} }, scales:{ y:{ grid:{color:'#f0f0f0'}, ticks:{callback:v=>`${v}%`,font:{size:10},color:'#aaa'} }, x:{ grid:{display:false}, ticks:{font:{size:9},color:'#666',maxRotation:45} } } },
    });
  }
}

// ── Aba: Franquias ────────────────────────────────────────────

function _renderFranquias(pane) {
  const franquias = DATA.franquias;
  if (!franquias.length) {
    pane.innerHTML = _emptyState('Nenhuma franquia carregada', 'Importe uma planilha na aba Importar.');
    return;
  }

  pane.innerHTML = `
    <div class="card">
      <div class="card-header">
        <div class="card-title">Ranking de franquias</div>
        <div style="display:flex;gap:8px">
          <select id="wise-filter-grupo" style="padding:5px 10px;border:1px solid var(--border);border-radius:6px;font-size:12px;background:var(--surface);font-family:var(--font)">
            <option value="">Todos os grupos</option>
            ${[...new Set(franquias.map(f=>f.grupo).filter(Boolean))].sort().map(g=>`<option value="${g}">${g}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="table-scroll">
        <table style="width:100%;border-collapse:collapse;font-size:12px">
          <thead><tr>
            <th style="padding:9px 14px;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.07em;color:var(--gray-500);background:var(--gray-50);border-bottom:1px solid var(--border)">#</th>
            <th style="padding:9px 14px;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.07em;color:var(--gray-500);background:var(--gray-50);border-bottom:1px solid var(--border)">Franquia</th>
            <th style="padding:9px 14px;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.07em;color:var(--gray-500);background:var(--gray-50);border-bottom:1px solid var(--border)">Grupo</th>
            <th style="padding:9px 14px;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.07em;color:var(--gray-500);background:var(--gray-50);border-bottom:1px solid var(--border);text-align:right">Faturamento</th>
            <th style="padding:9px 14px;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.07em;color:var(--gray-500);background:var(--gray-50);border-bottom:1px solid var(--border);text-align:right">Meta</th>
            <th style="padding:9px 14px;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.07em;color:var(--gray-500);background:var(--gray-50);border-bottom:1px solid var(--border);text-align:right">Atingimento</th>
          </tr></thead>
          <tbody id="wise-franq-tbody"></tbody>
        </table>
      </div>
    </div>
  `;
  _renderFranquiasTable(franquias);

  pane.querySelector('#wise-filter-grupo')?.addEventListener('change', e => {
    const g = e.target.value;
    _renderFranquiasTable(g ? franquias.filter(f=>f.grupo===g) : franquias);
  });
}

function _renderFranquiasTable(franquias) {
  const tbody = _el?.querySelector('#wise-franq-tbody');
  if (!tbody) return;
  tbody.innerHTML = franquias.map((f,i) => `
    <tr>
      <td style="padding:8px 14px;border-bottom:1px solid var(--border-light)"><div class="rank-num ${i<3?'top':''}">${i+1}</div></td>
      <td style="padding:8px 14px;border-bottom:1px solid var(--border-light);font-weight:500">${f.franquia.replace('FRANQUIA /','').trim()}</td>
      <td style="padding:8px 14px;border-bottom:1px solid var(--border-light);color:var(--gray-500)">${f.grupo||'—'}</td>
      <td style="padding:8px 14px;border-bottom:1px solid var(--border-light);text-align:right;font-variant-numeric:tabular-nums">${fmt(f.faturamento)}</td>
      <td style="padding:8px 14px;border-bottom:1px solid var(--border-light);text-align:right;color:var(--gray-500)">${f.meta>0?fmt(f.meta):'—'}</td>
      <td style="padding:8px 14px;border-bottom:1px solid var(--border-light);text-align:right">
        <div style="display:flex;align-items:center;gap:8px;justify-content:flex-end">
          <div style="width:60px;height:5px;background:var(--border-light);border-radius:3px"><div style="height:5px;border-radius:3px;background:${progColor(f.atingimento)};width:${Math.min(f.atingimento,100)}%"></div></div>
          <span style="font-size:11px;font-weight:600;color:${progColor(f.atingimento)}">${pct(f.atingimento)}</span>
        </div>
      </td>
    </tr>
  `).join('');
}

// ── Aba: Produtos ─────────────────────────────────────────────

function _renderProdutos(pane_) {
  const pane = pane_ || _el?.querySelector('#wise-pane');
  if (!pane) return;
  const produtos = DATA.produtos;

  if (!produtos.length) {
    pane.innerHTML = _emptyState('Nenhum produto carregado', 'Importe uma planilha na aba Importar.');
    return;
  }

  pane.innerHTML = `
    <div class="card">
      <div class="card-header" style="flex-wrap:wrap;gap:8px">
        <div class="card-title">Ranking de produtos</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <div class="search-wrap" style="min-width:180px">
            <i class="ti ti-search search-icon"></i>
            <input id="wise-search" placeholder="Buscar produto..." style="width:100%;padding:7px 10px 7px 32px;border:1px solid var(--border);border-radius:var(--radius-md);font-size:12px;background:var(--surface);outline:none">
          </div>
          <select id="wise-filter-gen" style="padding:5px 10px;border:1px solid var(--border);border-radius:6px;font-size:12px;background:var(--surface);font-family:var(--font)">
            <option value="">Todos gêneros</option>
            ${[...new Set(produtos.map(p=>p.genero).filter(Boolean))].sort().map(g=>`<option value="${g}">${g}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="table-scroll">
        <table style="width:100%;border-collapse:collapse;font-size:12px">
          <thead><tr>
            ${['#','Produto','Grupo','Gênero','Qtd','Faturamento','% Part.'].map(h=>`<th style="padding:9px 14px;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.07em;color:var(--gray-500);background:var(--gray-50);border-bottom:1px solid var(--border)">${h}</th>`).join('')}
          </tr></thead>
          <tbody id="wise-prod-tbody"></tbody>
        </table>
      </div>
    </div>
  `;

  const totalFat = produtos.reduce((s,p)=>s+p.faturamento,0);
  const renderTable = (prods) => {
    const tbody = _el?.querySelector('#wise-prod-tbody');
    if (!tbody) return;
    tbody.innerHTML = prods.map((p,i) => {
      const share = totalFat > 0 ? (p.faturamento/totalFat*100) : 0;
      return `<tr>
        <td style="padding:8px 14px;border-bottom:1px solid var(--border-light)"><div class="rank-num ${i<3?'top':''}">${i+1}</div></td>
        <td style="padding:8px 14px;border-bottom:1px solid var(--border-light);font-weight:500">${p.produto}</td>
        <td style="padding:8px 14px;border-bottom:1px solid var(--border-light);color:var(--gray-500)">${p.grupo||'—'}</td>
        <td style="padding:8px 14px;border-bottom:1px solid var(--border-light);color:var(--gray-500)">${p.genero||'—'}</td>
        <td style="padding:8px 14px;border-bottom:1px solid var(--border-light);text-align:right">${fmtN(p.qtd)}</td>
        <td style="padding:8px 14px;border-bottom:1px solid var(--border-light);text-align:right;font-weight:600">${fmt(p.faturamento)}</td>
        <td style="padding:8px 14px;border-bottom:1px solid var(--border-light)">
          <div style="display:flex;align-items:center;gap:6px">
            <div style="flex:1;height:5px;background:var(--border-light);border-radius:3px"><div style="height:5px;border-radius:3px;background:var(--black);width:${share.toFixed(1)}%"></div></div>
            <span style="font-size:10px;color:var(--gray-500);min-width:38px;text-align:right">${share.toFixed(1)}%</span>
          </div>
        </td>
      </tr>`;
    }).join('');
  };
  renderTable(produtos);

  pane.querySelector('#wise-search')?.addEventListener('input', e => {
    const q = e.target.value.toLowerCase();
    renderTable(produtos.filter(p=>p.produto.toLowerCase().includes(q)));
  });
  pane.querySelector('#wise-filter-gen')?.addEventListener('change', e => {
    const g = e.target.value;
    renderTable(g ? produtos.filter(p=>p.genero===g) : produtos);
  });
}

// ── Aba: Importar ─────────────────────────────────────────────

function _renderImportar(pane) {
  pane.innerHTML = `
    <div class="card" style="max-width:600px">
      <div class="card-header"><div class="card-title">Importar planilha Wise</div></div>
      <p style="font-size:13px;color:var(--gray-600);margin-bottom:20px;line-height:1.6">
        Selecione o arquivo exportado do sistema Wise. O arquivo deve conter as abas
        <code style="background:var(--gray-100);padding:1px 5px;border-radius:3px">WISE</code>,
        <code style="background:var(--gray-100);padding:1px 5px;border-radius:3px">PORT</code> e
        <code style="background:var(--gray-100);padding:1px 5px;border-radius:3px">META</code>.
      </p>
      <div class="upload-zone" id="wise-upload-zone"
        ondragover="event.preventDefault();this.classList.add('drag')"
        ondragleave="this.classList.remove('drag')"
        ondrop="event.preventDefault();this.classList.remove('drag');window._wise.dropFile(event)">
        <input type="file" accept=".xlsx,.xls" onchange="window._wise.handleFile(this)">
        <div class="upload-zone-icon"><i class="ti ti-cloud-upload"></i></div>
        <div class="upload-zone-title">Clique para selecionar ou arraste o arquivo aqui</div>
        <div class="upload-zone-sub">*.xlsx — máx. 50 MB</div>
      </div>
      <div id="wise-import-status" style="margin-top:16px"></div>
      <div id="wise-preview-card" style="display:none;margin-top:16px">
        <div id="wise-preview-content"></div>
        <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:12px;padding-top:12px;border-top:1px solid var(--border-light)">
          <button onclick="window._wise.cancelImport()" class="btn btn-secondary">Cancelar</button>
          <button onclick="window._wise.applyImport()" class="btn btn-primary"><i class="ti ti-check" style="font-size:14px"></i>Aplicar</button>
        </div>
      </div>
    </div>
  `;

  window._wise = {
    handleFile: (inp) => { if(inp.files[0]) _processWiseFile(inp.files[0]); },
    dropFile:   (e)   => { const f=e.dataTransfer.files[0]; if(f) _processWiseFile(f); },
    applyImport:()    => _applyImport(),
    cancelImport:()   => { _pendingImport=null; _el.querySelector('#wise-preview-card').style.display='none'; },
  };
}

async function _processWiseFile(file) {
  const status = _el?.querySelector('#wise-import-status');
  const preview = _el?.querySelector('#wise-preview-card');
  if (status) status.innerHTML = '<div style="display:flex;align-items:center;gap:8px;font-size:13px"><div class="spinner"></div> Processando planilha…</div>';

  try {
    const wb = await xlsxService.fromFile(file);
    xlsxService.requireSheets(wb, ['WISE', 'PORT', 'META']);
    const parsed = _parseWiseXLSX(wb);
    _pendingImport = parsed;

    if (preview) {
      const content = _el.querySelector('#wise-preview-content');
      if (content) {
        content.innerHTML = `
          <div class="kpi-grid" style="grid-template-columns:repeat(4,1fr)">
            <div class="kpi-card"><div class="kpi-label">Faturamento</div><div class="kpi-value" style="font-size:16px">${fmt(parsed.total_faturamento)}</div></div>
            <div class="kpi-card"><div class="kpi-label">Meta</div><div class="kpi-value" style="font-size:16px">${fmt(parsed.total_meta)}</div></div>
            <div class="kpi-card"><div class="kpi-label">Atingimento</div><div class="kpi-value" style="font-size:16px;color:${progColor(parsed.total_atingimento)}">${pct(parsed.total_atingimento)}</div></div>
            <div class="kpi-card"><div class="kpi-label">Franquias</div><div class="kpi-value" style="font-size:16px">${parsed.franquias.length}</div></div>
          </div>
        `;
      }
      preview.style.display = 'block';
    }
    if (status) status.innerHTML = `<div class="alert alert-success"><i class="ti ti-check"></i>Planilha lida: ${fmtN(parsed.total_qtd)} peças em ${parsed.franquias.length} franquias. Confirme abaixo para aplicar.</div>`;
  } catch (err) {
    if (status) status.innerHTML = `<div class="alert alert-error"><i class="ti ti-alert-circle"></i>${err.message}</div>`;
  }
}

function _parseWiseXLSX(wb) {
  const metaRows   = xlsxService.sheetToMatrix(wb, xlsxService.findSheet(wb, 'META'));
  const portRows   = xlsxService.sheetToMatrix(wb, xlsxService.findSheet(wb, 'PORT'));
  const vendasRows = xlsxService.sheetToMatrix(wb, xlsxService.findSheet(wb, 'WISE'));

  const meta = {};
  for (let i=1; i<metaRows.length; i++) {
    const r=metaRows[i]; if(r[1]&&r[2]) meta[String(r[1]).trim()]={grupo:String(r[0]||'').trim(),meta:parseFloat(r[2])||0};
  }

  const portfolio = {};
  for (let i=1; i<portRows.length; i++) {
    const r=portRows[i]; const ch=String(r[2]||'').trim();
    if(ch) portfolio[ch]={produto:String(r[4]||'').trim(),pv:parseFloat(r[10])||0,grupo:String(r[13]||'').trim(),genero:String(r[12]||'').trim()};
  }

  const vendasAgg={}, prodAgg={}, grupoAgg={};
  for (const row of vendasRows) {
    const col0=String(row[0]||'').trim();
    if(!col0.startsWith('FRANQUIA')) continue;
    const chave=String(row[28]||'').trim();
    const qty=parseFloat(row[19])||0;
    if(qty<=0||!chave) continue;
    const port=portfolio[chave]||{};
    const fat=qty*(port.pv||0);
    const prod=port.produto||chave;
    const grupo=port.grupo||''; const genero=port.genero||'';
    if(!vendasAgg[col0]) vendasAgg[col0]={faturamento:0,qtd:0};
    vendasAgg[col0].faturamento+=fat; vendasAgg[col0].qtd+=qty;
    if(!prodAgg[prod]) prodAgg[prod]={faturamento:0,qtd:0,grupo,genero};
    prodAgg[prod].faturamento+=fat; prodAgg[prod].qtd+=qty;
    if(grupo){ if(!grupoAgg[grupo]) grupoAgg[grupo]={faturamento:0,qtd:0}; grupoAgg[grupo].faturamento+=fat; grupoAgg[grupo].qtd+=qty; }
  }

  const franquias=Object.entries(vendasAgg).map(([f,d])=>({
    franquia:f, grupo:meta[f]?.grupo||'',
    faturamento:Math.round(d.faturamento), meta:Math.round(meta[f]?.meta||0),
    atingimento:meta[f]?.meta?Math.round(d.faturamento/meta[f].meta*1000)/10:0, qtd:Math.round(d.qtd),
  })).sort((a,b)=>b.faturamento-a.faturamento);

  const produtos=Object.entries(prodAgg).map(([k,v])=>({produto:k,faturamento:Math.round(v.faturamento),qtd:Math.round(v.qtd),grupo:v.grupo,genero:v.genero})).sort((a,b)=>b.faturamento-a.faturamento);
  const grupos=Object.entries(grupoAgg).map(([k,v])=>({grupo:k,faturamento:Math.round(v.faturamento),qtd:Math.round(v.qtd)})).sort((a,b)=>b.faturamento-a.faturamento);
  const totalFat=franquias.reduce((s,f)=>s+f.faturamento,0);
  const totalMeta=Object.values(meta).reduce((s,m)=>s+m.meta,0);

  return { total_faturamento:totalFat, total_meta:Math.round(totalMeta), total_atingimento:totalMeta?Math.round(totalFat/totalMeta*1000)/10:0, total_qtd:franquias.reduce((s,f)=>s+f.qtd,0), franquias, produtos, grupos, pedidos:{} };
}

function _applyImport() {
  if (!_pendingImport) return;
  DATA = _pendingImport;
  _pendingImport = null;
  if (window.showToast) window.showToast('Dashboard Wise atualizado!');
  _activeTab = 'visao-geral';
  _el.querySelectorAll('[data-wise-tab]').forEach(b => b.classList.toggle('active', b.dataset.wiseTab === 'visao-geral'));
  const pane = _el?.querySelector('#wise-pane');
  if (pane) _renderVisaoGeral(pane);
}

function _emptyState(title, sub) {
  return `<div class="empty-state" style="padding:60px"><div class="empty-state-icon"><i class="ti ti-database-off"></i></div><div class="empty-state-title">${title}</div><div class="empty-state-sub">${sub}</div></div>`;
}
