/**
 * OSKLEN INTRANET — Sidebar Component
 *
 * Renderiza o menu lateral e gerencia estado ativo/submenu.
 * Escuta eventos do router para atualizar o item ativo.
 */

import { APP, ROUTES } from '../config/app.config.js';
import eventBus from '../store/eventBus.js';

class Sidebar {
  /**
   * @param {HTMLElement} el — elemento container da sidebar
   */
  constructor(el) {
    this._el = el;
    this._activeId = null;
  }

  /** Renderiza a sidebar completa. */
  render(session) {
    this._el.innerHTML = `
      <div class="sidebar-logo">
        <div class="sidebar-logo-name">${APP.name}</div>
      </div>

      <div class="sidebar-user">
        <div class="sidebar-user-avatar" id="sb-avatar">${session?.initials ?? '?'}</div>
        <div class="sidebar-user-name"  id="sb-username">${session?.user ?? ''}</div>
        <button class="sidebar-logout" id="sb-logout" title="Sair">
          <i class="ti ti-logout"></i>
        </button>
      </div>

      <nav class="sidebar-nav" id="sb-nav">
        ${this._buildNav()}
      </nav>
    `;

    this._el.querySelector('#sb-logout')
      .addEventListener('click', () => eventBus.emit('auth:logout'));

    this._bindNavClicks();
    this._listenRouteChange();
  }

  /** Atualiza apenas o estado ativo sem re-renderizar tudo. */
  setActive(routeId) {
    this._activeId = routeId;
    this._el.querySelectorAll('.nav-item, .nav-subitem').forEach(el => {
      el.classList.toggle('active', el.dataset.route === routeId);
    });
  }

  /** @private */
  _buildNav() {
    // Agrupa rotas por section
    const sections = {};
    ROUTES.forEach(route => {
      if (route.hidden) return;
      if (!sections[route.section]) sections[route.section] = [];
      sections[route.section].push(route);
    });

    return Object.entries(sections).map(([section, routes]) => `
      <div class="sidebar-section-label">${section}</div>
      ${routes.map(r => `
        <button
          class="nav-item${r.pending ? ' pending' : ''}"
          data-route="${r.id}"
          ${r.pending ? 'disabled' : ''}
          title="${r.label}"
        >
          <i class="ti ${r.icon}" aria-hidden="true"></i>
          ${r.label}
          ${r.pending ? '<span class="nav-badge">Em breve</span>' : ''}
        </button>
      `).join('')}
    `).join('');
  }

  /** @private */
  _bindNavClicks() {
    this._el.querySelectorAll('.nav-item:not(.pending)').forEach(btn => {
      btn.addEventListener('click', () => {
        const routeId = btn.dataset.route;
        if (routeId) eventBus.emit('route:change', routeId);
      });
    });
  }

  /** @private */
  _listenRouteChange() {
    eventBus.on('route:change', (routeId) => this.setActive(routeId));
  }
}

export default Sidebar;
