/**
 * OSKLEN INTRANET — Módulo: Envelhecimento de Estoque
 * Domínio: /modules/estoque
 *
 * Análise de idade do estoque: produtos parados há mais de X dias.
 * Identifica itens para liquidação, remanejamento ou descarte.
 */

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
          <div class="kpi-label">Estoque fresco (&lt;30d)</div>
          <div class="kpi-value">64%</div>
          <div class="kpi-sub">dos SKUs em estoque</div>
        </div>
        <div class="kpi-card accent-amber">
          <div class="kpi-label">30–90 dias</div>
          <div class="kpi-value">21%</div>
          <div class="kpi-sub">atenção — avaliação recomendada</div>
        </div>
        <div class="kpi-card accent-red">
          <div class="kpi-label">Acima de 90 dias</div>
          <div class="kpi-value">15%</div>
          <div class="kpi-sub">risco de obsolescência</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Valor em risco</div>
          <div class="kpi-value">R$ 48k</div>
          <div class="kpi-sub">itens com +90 dias parados</div>
        </div>
      </div>
      <div class="empty-state" style="padding:60px">
        <div class="empty-state-icon"><i class="ti ti-clock-hour-4"></i></div>
        <div class="empty-state-title">Envelhecimento de Estoque</div>
        <div class="empty-state-sub">
          Módulo estruturado. Requer data de entrada de cada lote/SKU no estoque
          para calcular a idade exata. Integração via Supabase ou importação de planilha.
        </div>
      </div>
    </div>
  `;
}
