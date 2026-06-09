/**
 * OSKLEN INTRANET — Módulo: Curva ABC
 * Domínio: /modules/estoque
 *
 * Análise de curva ABC por produto/SKU.
 * Classifica produtos em A (80% do faturamento), B (15%) e C (5%).
 */

import { getEstoque } from '../../services/dataService.js';
import { formatBRL, formatN, formatPct } from '../../utils/formatters.js';

let _el = null;
let _chart = null;

// ── Contrato de módulo ────────────────────────────────────────

export async function mount(el, filters = {}) {
  _el = el;
  _el.innerHTML = _skeleton();
  await _render(filters);
}

export function unmount() {
  if (_chart) { try { _chart.destroy(); } catch(_) {} _chart = null; }
  _el = null;
}

export async function refresh() {
  if (!_el) return;
  await _render();
}

export function onFilterChange(filters) {
  refresh();
}

// ── Renderização ──────────────────────────────────────────────

async function _render(filters = {}) {
  const rawData = await getEstoque(filters);

  // Dados mock enquanto dataService não retorna estoque real
  const produtos = rawData.length > 0 ? rawData : _mockProdutos();
  const classificados = _classificarABC(produtos);
  const kpis = _calcularKPIs(classificados);

  if (!_el) return;

  _el.innerHTML = `
    <div class="fade-in">
      ${_renderKPIs(kpis, classificados)}
      <div class="row-2">
        ${_renderChartABC(classificados)}
        ${_renderDistribuicao(kpis)}
      </div>
      ${_renderTabela(classificados)}
    </div>
  `;

  _buildChart(classificados);
}

function _renderKPIs(kpis, dados) {
  const totalA = dados.filter(p => p.curva === 'A').length;
  const totalB = dados.filter(p => p.curva === 'B').length;
  const totalC = dados.filter(p => p.curva === 'C').length;

  return `
    <div class="kpi-grid" style="margin-bottom:20px">
      <div class="kpi-card">
        <div class="kpi-label"><i class="ti ti-package" aria-hidden="true"></i>Total SKUs</div>
        <div class="kpi-value">${formatN(dados.length)}</div>
        <div class="kpi-sub">produtos ativos</div>
      </div>
      <div class="kpi-card accent-green">
        <div class="kpi-label">Curva A</div>
        <div class="kpi-value">${totalA}</div>
        <div class="kpi-sub">${formatPct(kpis.pctFatA)} do faturamento</div>
      </div>
      <div class="kpi-card accent-amber">
        <div class="kpi-label">Curva B</div>
        <div class="kpi-value">${totalB}</div>
        <div class="kpi-sub">${formatPct(kpis.pctFatB)} do faturamento</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Curva C</div>
        <div class="kpi-value">${totalC}</div>
        <div class="kpi-sub">${formatPct(kpis.pctFatC)} do faturamento</div>
      </div>
    </div>
  `;
}

function _renderChartABC(dados) {
  return `
    <div class="card" style="margin-bottom:0">
      <div class="card-header">
        <div class="card-title">Curva ABC — Pareto</div>
        <div style="font-size:11px;color:var(--gray-500)">% acumulado do faturamento</div>
      </div>
      <div class="chart-wrap h-280">
        <canvas id="chart-abc" role="img" aria-label="Gráfico de curva ABC Pareto"></canvas>
      </div>
    </div>
  `;
}

function _renderDistribuicao(kpis) {
  const bars = [
    { label: 'A', pct: kpis.pctProdA, fatPct: kpis.pctFatA, color: 'var(--green)' },
    { label: 'B', pct: kpis.pctProdB, fatPct: kpis.pctFatB, color: 'var(--amber)' },
    { label: 'C', pct: kpis.pctProdC, fatPct: kpis.pctFatC, color: 'var(--gray-400)' },
  ].map(b => `
    <div style="margin-bottom:14px">
      <div style="display:flex;justify-content:space-between;margin-bottom:4px">
        <span style="font-size:12px;font-weight:600">Curva ${b.label}</span>
        <span style="font-size:11px;color:var(--gray-500)">${formatPct(b.pct)} dos produtos → ${formatPct(b.fatPct)} do fat.</span>
      </div>
      <div class="prog-bar" style="height:8px">
        <div class="prog-fill" style="width:${b.pct}%;background:${b.color}"></div>
      </div>
    </div>
  `).join('');

  return `
    <div class="card" style="margin-bottom:0">
      <div class="card-header">
        <div class="card-title">Distribuição produtos × faturamento</div>
      </div>
      <div style="padding-top:8px">${bars}</div>
      <div class="alert alert-info" style="margin-top:16px;margin-bottom:0;font-size:12px">
        <i class="ti ti-info-circle" aria-hidden="true"></i>
        Curva A: top 20% dos produtos responsáveis por ~80% do faturamento.
      </div>
    </div>
  `;
}

function _renderTabela(dados) {
  const rows = dados.slice(0, 50).map((p, i) => {
    const curvaClass = p.curva === 'A' ? 'badge-green' : p.curva === 'B' ? 'badge-amber' : 'badge-neutral';
    return `
      <tr>
        <td><div class="rank-num ${i < 3 ? 'top' : ''}">${i + 1}</div></td>
        <td style="font-weight:500">${p.nome}</td>
        <td>${p.grupo ?? '—'}</td>
        <td class="r">${formatN(p.qtd)}</td>
        <td class="r">${formatBRL(p.faturamento, true)}</td>
        <td class="r">${formatPct(p.fatAcumulado)}</td>
        <td style="text-align:center"><span class="badge ${curvaClass}">${p.curva}</span></td>
      </tr>
    `;
  }).join('');

  return `
    <div class="table-card">
      <div class="table-card-header">
        <div class="table-card-title">Produtos por curva</div>
        <span style="font-size:11px;color:var(--gray-500)">Top 50 exibidos</span>
      </div>
      <div class="table-scroll">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Produto</th>
              <th>Grupo</th>
              <th class="r">Qtd. vendida</th>
              <th class="r">Faturamento</th>
              <th class="r">Fat. acumulado</th>
              <th style="text-align:center">Curva</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
  `;
}

function _buildChart(dados) {
  const canvas = _el?.querySelector('#chart-abc');
  if (!canvas || !window.Chart) return;
  if (_chart) { _chart.destroy(); }

  const labels = dados.map((_, i) => i + 1);
  const fatAcum = dados.map(p => p.fatAcumulado);

  // Cores por curva
  const bgColors = dados.map(p =>
    p.curva === 'A' ? 'rgba(26,107,60,0.7)'
    : p.curva === 'B' ? 'rgba(122,85,0,0.6)'
    : 'rgba(200,200,200,0.5)'
  );

  _chart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Fat. acumulado %',
          data: fatAcum,
          type: 'line',
          borderColor: '#111',
          borderWidth: 2,
          pointRadius: 0,
          fill: false,
          yAxisID: 'y2',
          tension: 0.3,
        },
        {
          label: 'Faturamento',
          data: dados.map(p => p.faturamento),
          backgroundColor: bgColors,
          borderRadius: 2,
          yAxisID: 'y',
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
            label: ctx => ctx.datasetIndex === 0
              ? `Acum.: ${ctx.raw.toFixed(1)}%`
              : formatBRL(ctx.raw, true),
          },
        },
      },
      scales: {
        y: { grid: { color: '#f0f0f0' }, ticks: { callback: v => formatBRL(v, true), font: { size: 9 }, color: '#aaa' } },
        y2: { position: 'right', min: 0, max: 100, grid: { display: false }, ticks: { callback: v => `${v}%`, font: { size: 9 }, color: '#888' } },
        x: { display: false },
      },
    },
  });
}

// ── Lógica de negócio ─────────────────────────────────────────

function _classificarABC(produtos) {
  const sorted = [...produtos].sort((a, b) => b.faturamento - a.faturamento);
  const total  = sorted.reduce((s, p) => s + p.faturamento, 0);
  let acum = 0;

  return sorted.map(p => {
    acum += p.faturamento;
    const pct = total > 0 ? (acum / total) * 100 : 0;
    return {
      ...p,
      fatAcumulado: Math.round(pct * 10) / 10,
      curva: pct <= 80 ? 'A' : pct <= 95 ? 'B' : 'C',
    };
  });
}

function _calcularKPIs(dados) {
  const total    = dados.reduce((s, p) => s + p.faturamento, 0);
  const grupos   = { A: [], B: [], C: [] };
  dados.forEach(p => grupos[p.curva].push(p));

  const fatGrupo = (g) => grupos[g].reduce((s, p) => s + p.faturamento, 0);
  const pct      = (v) => total > 0 ? Math.round((v / total) * 1000) / 10 : 0;
  const pctProd  = (g) => dados.length > 0 ? Math.round((grupos[g].length / dados.length) * 1000) / 10 : 0;

  return {
    pctFatA: pct(fatGrupo('A')), pctFatB: pct(fatGrupo('B')), pctFatC: pct(fatGrupo('C')),
    pctProdA: pctProd('A'),       pctProdB: pctProd('B'),       pctProdC: pctProd('C'),
  };
}

function _mockProdutos() {
  const grupos = ['Masculino', 'Feminino', 'Acessórios', 'Calçados'];
  return Array.from({ length: 80 }, (_, i) => ({
    nome:        `Produto ${String(i + 1).padStart(3, '0')}`,
    grupo:       grupos[i % grupos.length],
    qtd:         Math.round(Math.random() * 200 + 10),
    faturamento: Math.round(Math.random() * 50000 + 500),
  }));
}

function _skeleton() {
  return `
    <div class="kpi-grid" style="margin-bottom:20px">
      ${Array(4).fill('<div class="kpi-card skeleton" style="height:80px"></div>').join('')}
    </div>
    <div class="row-2">
      <div class="card skeleton" style="height:320px;margin-bottom:0"></div>
      <div class="card skeleton" style="height:320px;margin-bottom:0"></div>
    </div>
  `;
}
