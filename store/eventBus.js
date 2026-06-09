/**
 * OSKLEN INTRANET — EventBus
 *
 * Barramento de eventos global. Desacopla completamente os módulos entre si:
 * nenhum módulo importa outro diretamente — todos se comunicam via eventos.
 *
 * Uso:
 *   import eventBus from '../store/eventBus.js';
 *
 *   // Escutar
 *   eventBus.on('filters:change', (filters) => { ... });
 *
 *   // Emitir
 *   eventBus.emit('filters:change', { periodo: '2026', lojas: [...] });
 *
 *   // Remover listener (sempre chamar no unmount do módulo)
 *   eventBus.off('filters:change', myHandler);
 *
 * Eventos padrão do sistema:
 *   'filters:change'   — filtros globais foram alterados
 *   'route:change'     — navegação para nova página
 *   'auth:login'       — usuário fez login
 *   'auth:logout'      — usuário fez logout
 *   'data:refresh'     — solicitação de refresh de dados
 *   'toast:show'       — exibe um toast (payload: { message, type })
 *   'modal:open'       — abre um modal (payload: { id })
 *   'modal:close'      — fecha o modal atual
 */

class EventBus {
  constructor() {
    this._listeners = {};
  }

  /**
   * Registra um listener para um evento.
   * @param {string} event
   * @param {Function} fn
   */
  on(event, fn) {
    if (!this._listeners[event]) {
      this._listeners[event] = [];
    }
    this._listeners[event].push(fn);
    return this; // encadeável
  }

  /**
   * Remove um listener específico.
   * @param {string} event
   * @param {Function} fn
   */
  off(event, fn) {
    if (!this._listeners[event]) return this;
    this._listeners[event] = this._listeners[event].filter(l => l !== fn);
    return this;
  }

  /**
   * Emite um evento com dados opcionais.
   * @param {string} event
   * @param {*} payload
   */
  emit(event, payload) {
    const listeners = this._listeners[event];
    if (!listeners || listeners.length === 0) return this;
    listeners.forEach(fn => {
      try {
        fn(payload);
      } catch (err) {
        console.error(`[EventBus] Erro no listener de "${event}":`, err);
      }
    });
    return this;
  }

  /**
   * Registra um listener que dispara apenas uma vez.
   * @param {string} event
   * @param {Function} fn
   */
  once(event, fn) {
    const wrapper = (payload) => {
      fn(payload);
      this.off(event, wrapper);
    };
    this.on(event, wrapper);
    return this;
  }

  /** Remove todos os listeners de um evento (útil no teardown). */
  clear(event) {
    if (event) {
      delete this._listeners[event];
    } else {
      this._listeners = {};
    }
    return this;
  }
}

// Singleton — uma instância para toda a aplicação
const eventBus = new EventBus();
export default eventBus;
