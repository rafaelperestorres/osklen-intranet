/**
 * OSKLEN INTRANET — FiltersStore
 *
 * Estado reativo dos filtros globais. Fonte única de verdade para todos os
 * filtros que afetam múltiplos dashboards simultaneamente.
 *
 * Uso:
 *   import filtersStore from '../store/filtersStore.js';
 *
 *   // Ler estado atual
 *   const filters = filtersStore.get();
 *
 *   // Atualizar um filtro
 *   filtersStore.set({ periodo: '2026' });
 *
 *   // Escutar mudanças (retorna fn de cleanup — chamar no unmount)
 *   const unsubscribe = filtersStore.subscribe((filters) => {
 *     myModule.onFilterChange(filters);
 *   });
 *   // No unmount do módulo:
 *   unsubscribe();
 *
 *   // Resetar todos os filtros
 *   filtersStore.reset();
 */

import eventBus from './eventBus.js';

/** Filtros padrão — estado inicial da aplicação */
const DEFAULT_FILTERS = {
  periodo:    null,   // string | null — ex: '2026', '2025'
  mes:        null,   // string | null — ex: '2026-05'
  lojas:      [],     // string[]      — IDs das lojas selecionadas
  franquias:  [],     // string[]      — grupos econômicos selecionados
  regionais:  [],     // string[]      — regionais selecionadas
  supervisoes:[],     // string[]
  canais:     [],     // string[]      — ex: ['SSS', 'FRANQUIA']
  grupos:     [],     // string[]      — grupos de produto
};

class FiltersStore {
  constructor() {
    this._state = { ...DEFAULT_FILTERS };
    this._subscribers = [];
  }

  /**
   * Retorna uma cópia do estado atual dos filtros.
   * @returns {Object}
   */
  get() {
    return { ...this._state };
  }

  /**
   * Atualiza um ou mais filtros. Faz merge com o estado atual.
   * Emite 'filters:change' via eventBus após cada atualização.
   * @param {Object} patch — campos a atualizar
   */
  set(patch) {
    this._state = { ...this._state, ...patch };
    this._notify();
    return this;
  }

  /**
   * Reseta todos os filtros para os valores padrão.
   */
  reset() {
    this._state = { ...DEFAULT_FILTERS };
    this._notify();
    return this;
  }

  /**
   * Reseta apenas os filtros de dimensão (lojas, franquias, etc.)
   * mantendo o período selecionado.
   */
  resetDimensions() {
    this._state = {
      ...this._state,
      lojas:       [],
      franquias:   [],
      regionais:   [],
      supervisoes: [],
      canais:      [],
      grupos:      [],
    };
    this._notify();
    return this;
  }

  /**
   * Verifica se algum filtro de dimensão está ativo.
   * @returns {boolean}
   */
  hasActiveFilters() {
    const { lojas, franquias, regionais, supervisoes, canais, grupos } = this._state;
    return [lojas, franquias, regionais, supervisoes, canais, grupos]
      .some(arr => arr.length > 0);
  }

  /**
   * Conta quantos filtros de dimensão estão ativos.
   * @returns {number}
   */
  countActiveFilters() {
    const { lojas, franquias, regionais, supervisoes, canais, grupos } = this._state;
    return [lojas, franquias, regionais, supervisoes, canais, grupos]
      .filter(arr => arr.length > 0).length;
  }

  /**
   * Inscreve uma função para ser chamada sempre que os filtros mudarem.
   * @param {Function} fn — recebe o estado atual como argumento
   * @returns {Function} unsubscribe — chamar no unmount do módulo
   */
  subscribe(fn) {
    this._subscribers.push(fn);
    return () => {
      this._subscribers = this._subscribers.filter(s => s !== fn);
    };
  }

  /** @private */
  _notify() {
    const state = this.get();
    this._subscribers.forEach(fn => {
      try { fn(state); }
      catch (err) { console.error('[FiltersStore] Erro no subscriber:', err); }
    });
    eventBus.emit('filters:change', state);
  }
}

// Singleton
const filtersStore = new FiltersStore();
export default filtersStore;
