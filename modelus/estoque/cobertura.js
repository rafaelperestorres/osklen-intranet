/**
 * OSKLEN INTRANET — Módulo: Cobertura de Estoque
 * Domínio: /modules/estoque
 *
 * Dias de cobertura por produto/loja.
 * Cruza estoque atual com média de vendas diária para calcular
 * quantos dias o estoque cobre a demanda projetada.
 */

import { formatN } from '../../utils/formatters.js';

let _el = null;

export async function mount(el, filters = {}) {
  _el = el;
  await _render(filters);
}

export function unmount() { _el = null; }

export async function refresh() { if (_el) await _render(); }

export function onFilterChange(filters) { refresh(); }

async function _render(filters = {}) {
  if (!_el) return;

  _el.innerHTML = `
    <div class="fade-in">
      <div class="kpi-grid" style="margin-bottom:20px">
        <div class="kpi-card accent-green">
          <div class="kpi-label">Cobertura média</div>
          <div class="kpi-value">42 dias</div>
          <div class="kpi-sub">estoque atual ÷ venda diária</div>
        </div>
        <div class="kpi-card accent-amber">
          <div class="kpi-label">Cobertura crítica (&lt;15d)</div>
          <div class="kpi-value">12</div>
          <div class="kpi-sub">SKUs em alerta</div>
        </div>
        <div class="kpi-card accent-red">
          <div class="kpi-label">Ruptura (0 dias)</div>
          <div class="kpi-value">3</div>
          <div class="kpi-sub">SKUs sem estoque</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Cobertura excesso (&gt;90d)</div>
          <div class="kpi-value">8</div>
          <div class="kpi-sub">SKUs com excesso</div>
        </div>
      </div>
      <div class="empty-state" style="padding:60px">
        <div class="empty-state-icon"><i class="ti ti-calendar-stats"></i></div>
        <div class="empty-state-title">Cobertura de Estoque</div>
        <div class="empty-state-sub">
          Este módulo será alimentado com dados reais ao conectar o Supabase.
          A estrutura de KPIs, gráficos e tabela já está pronta para receber os dados.
        </div>
      </div>
    </div>
  `;
}
