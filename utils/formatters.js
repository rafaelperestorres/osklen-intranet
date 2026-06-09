/**
 * OSKLEN INTRANET — Formatters
 *
 * Funções utilitárias de formatação. Centralizar aqui garante consistência
 * visual em todos os dashboards sem duplicar lógica.
 */

/**
 * Formata um valor em Reais.
 * @param {number} value
 * @param {boolean} compact — true retorna "R$ 1,2M" em vez de "R$ 1.200.000,00"
 * @returns {string}
 */
export function formatBRL(value, compact = false) {
  if (value == null || isNaN(value)) return '—';

  if (compact) {
    if (Math.abs(value) >= 1_000_000)
      return `R$ ${(value / 1_000_000).toFixed(1).replace('.', ',')}M`;
    if (Math.abs(value) >= 1_000)
      return `R$ ${(value / 1_000).toFixed(0)}k`;
  }

  return new Intl.NumberFormat('pt-BR', {
    style:                 'currency',
    currency:              'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/**
 * Formata um número inteiro com separador de milhar.
 * @param {number} value
 * @returns {string}
 */
export function formatN(value) {
  if (value == null || isNaN(value)) return '—';
  return new Intl.NumberFormat('pt-BR').format(Math.round(value));
}

/**
 * Formata uma porcentagem.
 * @param {number} value — ex: 87.5 → "87,5%"
 * @param {number} decimals
 * @returns {string}
 */
export function formatPct(value, decimals = 1) {
  if (value == null || isNaN(value)) return '—';
  return `${value.toFixed(decimals).replace('.', ',')}%`;
}

/**
 * Retorna a classe CSS de badge/cor baseada no atingimento de meta.
 * @param {number} pct — ex: 87.5
 * @returns {'badge-green'|'badge-amber'|'badge-red'}
 */
export function badgeFromPct(pct) {
  if (pct >= 100) return 'badge-green';
  if (pct >= 80)  return 'badge-amber';
  return 'badge-red';
}

/**
 * Retorna a classe CSS de cor baseada no atingimento.
 * @param {number} pct
 * @returns {'col-green'|'col-amber'|'col-red'}
 */
export function colorFromPct(pct) {
  if (pct >= 100) return 'col-green';
  if (pct >= 80)  return 'col-amber';
  return 'col-red';
}

/**
 * Converte iniciais de um nome completo.
 * @param {string} name — ex: "Rodrigo Murito"
 * @returns {string} — "RM"
 */
export function getInitials(name) {
  if (!name) return '?';
  return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
}

/**
 * Trunca texto longo com reticências.
 * @param {string} text
 * @param {number} maxLength
 * @returns {string}
 */
export function truncate(text, maxLength = 30) {
  if (!text) return '';
  return text.length > maxLength ? text.substring(0, maxLength) + '…' : text;
}

/**
 * Formata data no padrão brasileiro.
 * @param {string|Date} date
 * @returns {string} — "15/06/2026"
 */
export function formatDate(date) {
  if (!date) return '—';
  return new Intl.DateTimeFormat('pt-BR').format(new Date(date));
}

/**
 * Retorna rótulo de período legível.
 * @param {string} periodo — ex: "2026-05"
 * @returns {string} — "Maio 2026"
 */
export function formatPeriodo(periodo) {
  if (!periodo) return 'Todos os períodos';
  const meses = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  const [ano, mes] = periodo.split('-');
  if (mes) return `${meses[parseInt(mes, 10) - 1]} ${ano}`;
  return ano;
}
