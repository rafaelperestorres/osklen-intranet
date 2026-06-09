/**
 * OSKLEN INTRANET — Página: Estoque
 *
 * Orquestra os módulos de análise de estoque.
 * Cada aba corresponde a um módulo em /modules/estoque/.
 */

import filtersStore from '../store/filtersStore.js';
import eventBus from '../store/eventBus.js';

// Importação lazy dos módulos — cada aba carrega sob demanda
const MODULE_MAP = {
  'curva-abc':     () => import('../modules/estoque/curvaABC.js'),
  'cobertura':     () => import('../modules/estoque/cobertura.js'),
  'giro':          () => import('../modules/estoque/giro.js'),
  'envelhecimento':() => import('../modules/estoque/envelhecimento.js'),
};

const TABS = [
  { id: 'curva-abc',      label: 'Curva ABC' },
  { id: 'cobertura',      label: 'Cobertura' },
  { id: 'giro',           label: 'Giro' },
  { id: 'envelhecimento', label: 'Envelhecimento' },
];

let _el = null;
let _activeTab = 'curva-abc';
let _activeModule = null;
let _unsubscribeFilters = null;

// ── Contrato público ──────────────────────────────────────────

export async function mount(el) {
  _el = el;
  _el.innerHTML = _shell();
  _bindTabs();
  await _loadTab(_activeTab);

  _unsubscribeFilters = filtersStore.subscribe((filters) => {
    if (_activeModule?.onFilterChange) _activeModule.onFilterChange(filters);
  });

  eventBus.on('data:refresh', refresh);
}

export function unmount() {
  if (_activeModule?.unmount) _activeModule.unmount();
  _activeModule = null;

  if (_unsubscribeFilters) { _unsubscribeFilters(); _unsubscribeFilters = null; }
  eventBus.off('data:refresh', refresh);
  _el = null;
}

export async function refresh() {
  if (_activeModule?.refresh) await _activeModule.refresh();
}

export function onFilterChange(filters) {
  if (_activeModule?.onFilterChange) _activeModule.onFilterChange(filters);
}

// ── Privado ───────────────────────────────────────────────────

function _shell() {
  const tabs = TABS.map(t => `
    <button class="module-tab${t.id === _activeTab ? ' active' : ''}"
            data-tab="${t.id}">
      ${t.label}
    </button>
  `).join('');

  return `
    <div class="module-tabs">${tabs}</div>
    <div id="estoque-pane" class="fade-in"></div>
  `;
}

function _bindTabs() {
  _el.querySelectorAll('.module-tab').forEach(btn => {
    btn.addEventListener('click', async () => {
      const tabId = btn.dataset.tab;
      if (tabId === _activeTab) return;

      // Desmontar módulo atual
      if (_activeModule?.unmount) _activeModule.unmount();
      _activeModule = null;

      // Atualizar UI das abas
      _el.querySelectorAll('.module-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      _activeTab = tabId;

      await _loadTab(tabId);
    });
  });
}

async function _loadTab(tabId) {
  const pane = _el?.querySelector('#estoque-pane');
  if (!pane) return;

  pane.innerHTML = '<div style="padding:40px;display:flex;justify-content:center"><div class="spinner"></div></div>';

  try {
    const moduleLoader = MODULE_MAP[tabId];
    if (!moduleLoader) throw new Error(`Módulo "${tabId}" não encontrado.`);

    const mod = await moduleLoader();
    _activeModule = mod;

    pane.innerHTML = '';
    await mod.mount(pane, filtersStore.get());
  } catch (err) {
    pane.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon"><i class="ti ti-alert-circle"></i></div>
        <div class="empty-state-title">Módulo indisponível</div>
        <div class="empty-state-sub">${err.message}</div>
      </div>
    `;
  }
}
