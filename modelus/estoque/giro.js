/**
 * OSKLEN INTRANET — Módulo: Giro de Estoque
 * Domínio: /modules/estoque
 *
 * Índice de giro = CMV / Estoque médio.
 * Quanto maior, mais vezes o estoque foi renovado no período.
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
        <div class="kpi-card">
          <div class="kpi-label">Giro médio</div>
          <div class="kpi-value">3,2×</div>
          <div class="kpi-sub">no período</div>
        </div>
        <div class="kpi-card accent-green">
          <div class="kpi-label">Alto giro (&gt;4×)</div>
          <div class="kpi-value">28</div>
          <div class="kpi-sub">SKUs — reposição urgente</div>
        </div>
        <div class="kpi-card accent-red">
          <div class="kpi-label">Baixo giro (&lt;1×)</div>
          <div class="kpi-value">15</div>
          <div class="kpi-sub">SKUs — liquidação sugerida</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Giro ideal (1–3×)</div>
          <div class="kpi-value">57</div>
          <div class="kpi-sub">SKUs na faixa saudável</div>
        </div>
      </div>
      <div class="empty-state" style="padding:60px">
        <div class="empty-state-icon"><i class="ti ti-refresh-dot"></i></div>
        <div class="empty-state-title">Giro de Estoque</div>
        <div class="empty-state-sub">
          Módulo estruturado e pronto. Dados reais serão carregados via dataService
          ao conectar com Supabase ou importar planilha de CMV e estoque médio.
        </div>
      </div>
    </div>
  `;
}
