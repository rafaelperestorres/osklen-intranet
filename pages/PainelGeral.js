/**
 * OSKLEN INTRANET — Página: Painel Geral
 *
 * Orquestra os módulos do painel geral.
 * Esta página é a prova de conceito da Fase 1 — dados reais do dashboard_painelgeral.html.
 */

import { getKPIs, getFranquias, getFaturamentoMensal, getFilterOptions } from '../services/dataService.js';
import filtersStore from '../store/filtersStore.js';
import eventBus from '../store/eventBus.js';
import { formatBRL, formatPct, badgeFromPct, colorFromPct, formatN } from '../utils/formatters.js';

// Estado local da página
let _charts = {};
let _unsubscribeFilters = null;
let _unsubscribeRefresh = null;
let _el = null;

// ── Contrato público ──────────────────────────────────────────

export async function mount(el) {
  _el = el;
  el.innerHTML = _skeleton();

  try {
    await _loadFilterOptions();
    await _render();
  } catch (err) {
    el.innerHTML = _errorState(err.message);
    return;
  }

  _unsubscribeFilters = filtersStore.subscribe(() => refresh());
  _unsubscribeRefresh = () => eventBus.off('data:refresh', refresh);
  eventBus.on('data:refresh', refresh);
}

export function unmount() {
  // Destroy charts para evitar memory leak
  Object.values(_charts).forEach(c => { try { c.destroy(); } catch(_) {} });
  _charts = {};

  // Remover listeners
  if (_unsubscribeFilters) { _unsubscribeFilters(); _unsubscribeFilters = null; }
  if (_unsubscribeRefresh) { _unsubscribeRefresh(); _unsubscribeRefresh = null; }
  eventBus.off('data:refresh', refresh);

  _el = null;
}

export async function refresh() {
  if (!_el) return;
  _el.querySelector('#pg-content')?.classList.add('loading-pulse');
  await _render();
  _el.querySelector('#pg-content')?.classList.remove('loading-pulse');
}

export function onFilterChange(filters) {
  refresh();
}

// ── Renderização ──────────────────────────────────────────────

async function _render() {
  const filters = filtersStore.get();
  const [kpis, franquias, mensal] = await Promise.all([
    getKPIs(filters),
    getFranquias(filters),
    getFaturamentoMensal(filters),
  ]);

  if (!_el) return;

  _el.innerHTML = `
    <div id="pg-content" class="fade-in">
      ${_renderKPIs(kpis)}
      <div class="row-2">
        ${_renderChartCard('Faturamento mensal', 'chart-mensal', 'h-280')}
        ${_renderRankingCard(franquias)}
      </div>
      ${_renderFranquiasTable(franquias)}
    </div>
  `;

  _buildChartMensal(mensal);
  _bindTableSort();
}

function _renderKPIs(kpis) {
  const badge = badgeFromPct(kpis.atingimento);
  return `
    <div class="kpi-grid kpi-grid-4" style="margin-bottom:20px">
      <div class="kpi-card">
        <div class="kpi-label"><i class="ti ti-currency-real" aria-hidden="true"></i>Faturamento</div>
        <div class="kpi-value">${formatBRL(kpis.faturamento, true)}</div>
        <div class="kpi-sub">
          <span class="badge ${badge}">${formatPct(kpis.atingimento)} da meta</span>
        </div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label"><i class="ti ti-target" aria-hidden="true"></i>Meta</div>
        <div class="kpi-value">${formatBRL(kpis.meta, true)}</div>
        <div class="kpi-sub">Período atual</div>
      </div>
      <div class="kpi-card${kpis.lojas_acima > 0 ? ' accent-green' : ''}">
        <div class="kpi-label"><i class="ti ti-building-store" aria-hidden="true"></i>Lojas acima da meta</div>
        <div class="kpi-value">${kpis.lojas_acima}</div>
        <div class="kpi-sub">de ${kpis.total_lojas} lojas</div>
      </div>
      <div class="kpi-card${kpis.lojas_abaixo > 0 ? ' accent-red' : ' accent-green'}">
        <div class="kpi-label"><i class="ti ti-alert-triangle" aria-hidden="true"></i>Lojas abaixo de 80%</div>
        <div class="kpi-value">${kpis.lojas_abaixo}</div>
        <div class="kpi-sub">requerem atenção</div>
      </div>
    </div>
  `;
}

function _renderChartCard(title, canvasId, heightClass) {
  return `
    <div class="card" style="margin-bottom:0">
      <div class="card-header">
        <div>
          <div class="card-title">${title}</div>
        </div>
      </div>
      <div class="chart-wrap ${heightClass}">
        <canvas id="${canvasId}" role="img" aria-label="${title}"></canvas>
      </div>
    </div>
  `;
}

function _renderRankingCard(franquias) {
  const top5 = [...franquias].sort((a,b) => b.faturamento - a.faturamento).slice(0, 5);
  const maxFat = top5[0]?.faturamento ?? 1;

  const items = top5.map((f, i) => `
    <div class="db-rank-item" style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border-light);">
      <div class="rank-num ${i < 3 ? 'top' : ''}">${i + 1}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:12px;font-weight:600;color:var(--black);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${f.nome}</div>
        <div class="prog-bar" style="margin-top:4px;height:3px;background:var(--border-light);border-radius:2px">
          <div class="prog-fill" style="width:${Math.round((f.faturamento/maxFat)*100)}%"></div>
        </div>
      </div>
      <div style="font-size:12px;font-weight:600;color:var(--gray-700);white-space:nowrap">${formatBRL(f.faturamento, true)}</div>
    </div>
  `).join('');

  return `
    <div class="card" style="margin-bottom:0">
      <div class="card-header">
        <div class="card-title">Ranking de lojas</div>
        <div style="font-size:11px;color:var(--gray-500)">por faturamento</div>
      </div>
      ${items}
    </div>
  `;
}

function _renderFranquiasTable(franquias) {
  const rows = franquias.map(f => `
    <tr>
      <td style="font-weight:500">${f.nome}</td>
      <td>${f.grupo}</td>
      <td>${f.regional}</td>
      <td class="r">${formatBRL(f.faturamento, true)}</td>
      <td class="r">${formatBRL(f.meta, true)}</td>
      <td class="r">
        <div class="prog-wrap">
          <div class="prog-bar">
            <div class="prog-fill ${f.atingimento >= 100 ? 'green' : f.atingimento >= 80 ? 'amber' : 'red'}"
                 style="width:${Math.min(f.atingimento, 100)}%"></div>
          </div>
          <span class="prog-label ${colorFromPct(f.atingimento)}">${formatPct(f.atingimento)}</span>
        </div>
      </td>
    </tr>
  `).join('');

  return `
    <div class="table-card">
      <div class="table-card-header">
        <div class="table-card-title">Desempenho por loja</div>
      </div>
      <div class="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Loja</th>
              <th>Grupo</th>
              <th>Regional</th>
              <th class="r">Faturamento</th>
              <th class="r">Meta</th>
              <th class="r">Atingimento</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
  `;
}

function _buildChartMensal(mensal) {
  const canvas = _el?.querySelector('#chart-mensal');
  if (!canvas || !window.Chart) return;

  if (_charts['mensal']) { _charts['mensal'].destroy(); }

  _charts['mensal'] = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: mensal.map(m => m.mes),
      datasets: [
        {
          label: 'Faturamento',
          data: mensal.map(m => m.faturamento),
          backgroundColor: mensal.map((_, i) => i === mensal.length - 1 ? '#111111' : '#d4d4d4'),
          borderRadius: 4,
        },
        {
          label: 'Meta',
          data: mensal.map(m => m.meta),
          type: 'line',
          borderColor: '#888888',
          borderWidth: 1.5,
          borderDash: [4, 4],
          pointRadius: 0,
          fill: false,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => formatBRL(ctx.raw, true),
          },
        },
      },
      scales: {
        y: {
          grid: { color: '#f0f0f0' },
          ticks: {
            callback: v => formatBRL(v, true),
            font: { size: 10 },
            color: '#aaa',
          },
        },
        x: {
          grid: { display: false },
          ticks: { font: { size: 11 }, color: '#888' },
        },
      },
    },
  });
}

function _bindTableSort() {
  _el?.querySelectorAll('thead th').forEach(th => {
    th.addEventListener('click', () => {
      // Ordenação client-side — implementar conforme necessidade
    });
  });
}

async function _loadFilterOptions() {
  // Futuro: popular dropdowns de filtro com opções do dataService
}

function _skeleton() {
  return `
    <div style="padding:0">
      <div class="kpi-grid kpi-grid-4" style="margin-bottom:20px">
        ${Array(4).fill('<div class="kpi-card skeleton skeleton-kpi"></div>').join('')}
      </div>
      <div class="row-2">
        <div class="card skeleton" style="height:320px;margin-bottom:0"></div>
        <div class="card skeleton" style="height:320px;margin-bottom:0"></div>
      </div>
    </div>
  `;
}

function _errorState(message) {
  return `
    <div class="empty-state">
      <div class="empty-state-icon"><i class="ti ti-alert-circle"></i></div>
      <div class="empty-state-title">Erro ao carregar dados</div>
      <div class="empty-state-sub">${message}</div>
    </div>
  `;
}
