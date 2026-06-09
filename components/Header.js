/**
 * OSKLEN INTRANET — Header Component
 *
 * Topbar com título da página atual e ações globais.
 * O título é atualizado automaticamente via eventos de rota.
 */

import { ROUTES } from '../config/app.config.js';
import eventBus from '../store/eventBus.js';

class Header {
  /**
   * @param {HTMLElement} el — elemento .topbar
   */
  constructor(el) {
    this._el = el;
  }

  /** Renderiza o header com os dados da sessão. */
  render(session) {
    this._el.innerHTML = `
      <div class="topbar-title-wrap">
        <div class="topbar-title" id="hd-title">PAINEL GERAL</div>
      </div>
      <div class="topbar-actions">
        <button class="topbar-pill" id="hd-refresh" title="Atualizar dados">
          <i class="ti ti-refresh" aria-hidden="true"></i>
          Atualizar
        </button>
        <div class="topbar-avatar" id="hd-avatar" title="${session?.user ?? ''}">${session?.initials ?? '?'}</div>
      </div>
    `;

    this._el.querySelector('#hd-refresh')
      .addEventListener('click', () => eventBus.emit('data:refresh'));

    eventBus.on('route:change', (routeId) => this._updateTitle(routeId));
  }

  /** @private */
  _updateTitle(routeId) {
    const route = ROUTES.find(r => r.id === routeId);
    const titleEl = this._el.querySelector('#hd-title');
    if (titleEl && route) {
      titleEl.textContent = route.label.toUpperCase();
    }
  }
}

export default Header;
