/**
 * OSKLEN INTRANET — DataService (Supabase)
 *
 * ÚNICO ponto de acesso a dados em toda a aplicação.
 * Interface pública idêntica à versão mock — nenhuma page ou module mudou.
 *
 * Estratégia de dados:
 *   Os dashboards de Vendas, Faturamento, Wise e Pagamentos carregam dados
 *   via upload de XLSX — essa lógica fica nas próprias pages (correto, pois
 *   são dados transacionais importados manualmente pelo usuário).
 *
 *   Este serviço gerencia os dados ESTRUTURAIS e ANALÍTICOS que vivem
 *   permanentemente no Supabase:
 *     - Cadastro de franquias, lojas, grupos econômicos
 *     - Metas por loja/período
 *     - KPIs consolidados do Painel Geral
 *     - Dados de estoque (futura integração direta com ERP)
 *
 * Fallback para desenvolvimento:
 *   Se o Supabase não estiver configurado, todas as funções retornam
 *   dados mock — exatamente o comportamento das Fases 1/2.
 *
 * RLS (Row Level Security):
 *   Todas as queries respeitam automaticamente o empresa_id e o array
 *   de franquias do usuário autenticado, sem filtros manuais no código.
 *   As policies estão em /supabase/migrations/001_schema.sql.
 *
 * Convenção de erros:
 *   Todas as funções lançam { message, code } em caso de falha.
 *   As pages capturam via try/catch e exibem o estado de erro.
 */

// ── Fallback mock (idêntico à Fase 1/2) ──────────────────────
const MOCK_DELAY = 300;
const delay = (ms = MOCK_DELAY) => new Promise(r => setTimeout(r, ms));

const FRANQUIAS_MOCK = [
  { id:'sp-paulista',  nome:'SP — Paulista',   grupo:'Grupo A', regional:'Sudeste',  supervisor:'Ana Lima',   faturamento:312000, meta:300000 },
  { id:'rj-barra',     nome:'RJ — Barra',       grupo:'Grupo A', regional:'Sudeste',  supervisor:'Carlos M.',  faturamento:287000, meta:280000 },
  { id:'bh-savassi',   nome:'BH — Savassi',     grupo:'Grupo B', regional:'Sudeste',  supervisor:'Ana Lima',   faturamento:241000, meta:260000 },
  { id:'ctb-centro',   nome:'CTB — Centro',     grupo:'Grupo B', regional:'Sul',      supervisor:'Pedro S.',   faturamento:198000, meta:210000 },
  { id:'poa-moinhos',  nome:'POA — Moinhos',    grupo:'Grupo C', regional:'Sul',      supervisor:'Pedro S.',   faturamento:159000, meta:170000 },
  { id:'sp-iguatemi',  nome:'SP — Iguatemi',    grupo:'Grupo A', regional:'Sudeste',  supervisor:'Carlos M.',  faturamento:278000, meta:260000 },
  { id:'rj-ipanema',   nome:'RJ — Ipanema',     grupo:'Grupo A', regional:'Sudeste',  supervisor:'Ana Lima',   faturamento:195000, meta:200000 },
  { id:'for-meireles', nome:'FOR — Meireles',   grupo:'Grupo C', regional:'Nordeste', supervisor:'Lara V.',    faturamento:142000, meta:150000 },
  { id:'rec-boa',      nome:'REC — Boa Viagem', grupo:'Grupo C', regional:'Nordeste', supervisor:'Lara V.',    faturamento:128000, meta:140000 },
];

// ── Cliente Supabase (carregado sob demanda) ──────────────────
let _sb = null;
async function _getClient() {
  if (_sb) return _sb;
  try {
    const { getSupabase } = await import('./supabaseClient.js');
    _sb = getSupabase();
    return _sb;
  } catch (_) {
    return null; // Supabase não configurado → usar mock
  }
}

// ── Helper: construir filtros de query ────────────────────────
function _applyFilters(query, filters = {}) {
  if (filters.franquias?.length)
    query = query.in('grupo_economico', filters.franquias);
  if (filters.regionais?.length)
    query = query.in('regional', filters.regionais);
  if (filters.supervisoes?.length)
    query = query.in('supervisor', filters.supervisoes);
  if (filters.lojas?.length)
    query = query.in('id', filters.lojas);
  if (filters.periodo)
    query = query.eq('ano', filters.periodo);
  if (filters.mes)
    query = query.eq('mes', filters.mes);
  return query;
}

// ── Helper: tratar erro Supabase ──────────────────────────────
function _handleError(error, context) {
  const msg = error?.message ?? 'Erro desconhecido';
  console.error(`[DataService:${context}]`, msg, error);
  throw { message: msg, code: error?.code ?? 'UNKNOWN', context };
}

// ═══════════════════════════════════════════════════════════════
// API PÚBLICA — mesma assinatura da versão mock
// ═══════════════════════════════════════════════════════════════

/**
 * Lista de franquias com faturamento e atingimento de meta.
 * Tabela Supabase: public.franquias
 *
 * Schema esperado:
 *   id, nome, grupo_economico, regional, supervisor,
 *   faturamento (numeric), meta (numeric), empresa_id (uuid)
 *
 * @param {Object} filters — do filtersStore
 * @returns {Promise<Array>}
 */
export async function getFranquias(filters = {}) {
  const sb = await _getClient();

  if (!sb) {
    // ── Fallback mock ──
    await delay();
    let data = [...FRANQUIAS_MOCK];
    if (filters.franquias?.length)  data = data.filter(f => filters.franquias.includes(f.grupo));
    if (filters.regionais?.length)  data = data.filter(f => filters.regionais.includes(f.regional));
    if (filters.supervisoes?.length)data = data.filter(f => filters.supervisoes.includes(f.supervisor));
    return data.map(f => ({ ...f, atingimento: f.meta > 0 ? Math.round(f.faturamento / f.meta * 1000) / 10 : 0 }));
  }

  // ── Supabase ──
  let query = sb.from('franquias').select(`
    id, nome, grupo_economico, regional, supervisor,
    faturamento, meta, empresa_id
  `);
  query = _applyFilters(query, filters);

  const { data, error } = await query;
  if (error) _handleError(error, 'getFranquias');

  return (data ?? []).map(f => ({
    id:          f.id,
    nome:        f.nome,
    grupo:       f.grupo_economico,
    regional:    f.regional,
    supervisor:  f.supervisor,
    faturamento: f.faturamento ?? 0,
    meta:        f.meta ?? 0,
    atingimento: f.meta > 0 ? Math.round(f.faturamento / f.meta * 1000) / 10 : 0,
  }));
}

/**
 * KPIs consolidados para o Painel Geral.
 * Calculados client-side a partir de getFranquias() para
 * evitar uma chamada extra ao banco.
 *
 * @param {Object} filters
 * @returns {Promise<Object>}
 */
export async function getKPIs(filters = {}) {
  const franquias = await getFranquias(filters);
  const totalFat  = franquias.reduce((s, f) => s + f.faturamento, 0);
  const totalMeta = franquias.reduce((s, f) => s + f.meta, 0);
  return {
    faturamento:  totalFat,
    meta:         totalMeta,
    atingimento:  totalMeta > 0 ? Math.round(totalFat / totalMeta * 1000) / 10 : 0,
    total_lojas:  franquias.length,
    lojas_acima:  franquias.filter(f => f.atingimento >= 100).length,
    lojas_abaixo: franquias.filter(f => f.atingimento < 80).length,
  };
}

/**
 * Série temporal de faturamento mensal.
 * Tabela Supabase: public.faturamento_mensal
 *
 * Schema esperado:
 *   mes (varchar '2026-01'), faturamento (numeric), meta (numeric),
 *   empresa_id (uuid)
 *
 * @param {Object} filters
 * @returns {Promise<Array<{ mes, faturamento, meta }>>}
 */
export async function getFaturamentoMensal(filters = {}) {
  const sb = await _getClient();

  if (!sb) {
    await delay();
    return [
      { mes:'Jan', faturamento:1820000, meta:1900000 },
      { mes:'Fev', faturamento:1750000, meta:1800000 },
      { mes:'Mar', faturamento:2100000, meta:1950000 },
      { mes:'Abr', faturamento:2250000, meta:2100000 },
      { mes:'Mai', faturamento:2040000, meta:2000000 },
      { mes:'Jun', faturamento:2600000, meta:2200000 },
    ];
  }

  let query = sb
    .from('faturamento_mensal')
    .select('mes, faturamento, meta')
    .order('mes', { ascending: true });

  if (filters.periodo) query = query.like('mes', `${filters.periodo}%`);

  const { data, error } = await query;
  if (error) _handleError(error, 'getFaturamentoMensal');

  return (data ?? []).map(r => ({
    mes:         r.mes?.substring(5, 7) ? _mesAbrev(r.mes) : r.mes,
    faturamento: r.faturamento ?? 0,
    meta:        r.meta ?? 0,
  }));
}

/**
 * Opções para os filtros globais (valores únicos do cadastro).
 * Usados para popular dropdowns na FilterBar.
 *
 * @returns {Promise<{ grupos, regionais, supervisoes, lojas }>}
 */
export async function getFilterOptions() {
  const sb = await _getClient();

  if (!sb) {
    await delay(100);
    return {
      grupos:      [...new Set(FRANQUIAS_MOCK.map(f => f.grupo))].sort(),
      regionais:   [...new Set(FRANQUIAS_MOCK.map(f => f.regional))].sort(),
      supervisoes: [...new Set(FRANQUIAS_MOCK.map(f => f.supervisor))].sort(),
      lojas:       FRANQUIAS_MOCK.map(f => ({ id: f.id, nome: f.nome })),
    };
  }

  const { data, error } = await sb
    .from('franquias')
    .select('id, nome, grupo_economico, regional, supervisor');

  if (error) _handleError(error, 'getFilterOptions');

  const rows = data ?? [];
  return {
    grupos:      [...new Set(rows.map(r => r.grupo_economico).filter(Boolean))].sort(),
    regionais:   [...new Set(rows.map(r => r.regional).filter(Boolean))].sort(),
    supervisoes: [...new Set(rows.map(r => r.supervisor).filter(Boolean))].sort(),
    lojas:       rows.map(r => ({ id: r.id, nome: r.nome })),
  };
}

/**
 * Dados de estoque por produto.
 * Tabela Supabase: public.estoque
 *
 * Schema esperado:
 *   sku_id, nome, grupo, genero, qtd_estoque (int),
 *   faturamento (numeric), empresa_id (uuid)
 *
 * @param {Object} filters
 * @returns {Promise<Array>}
 */
export async function getEstoque(filters = {}) {
  const sb = await _getClient();

  if (!sb) {
    await delay();
    return []; // Mock vazio — módulos de estoque geram dados sintéticos internamente
  }

  let query = sb.from('estoque').select(`
    sku_id, nome, grupo, genero,
    qtd_estoque, faturamento, data_entrada
  `);

  if (filters.grupos?.length) query = query.in('grupo', filters.grupos);

  const { data, error } = await query;
  if (error) _handleError(error, 'getEstoque');

  return (data ?? []).map(r => ({
    nome:        r.nome,
    grupo:       r.grupo ?? '',
    genero:      r.genero ?? '',
    qtd:         r.qtd_estoque ?? 0,
    faturamento: r.faturamento ?? 0,
    dataEntrada: r.data_entrada ?? null,
  }));
}

/**
 * Metas por loja e período.
 * Usadas nos dashboards de Vendas e Faturamento para calcular atingimento.
 * Tabela Supabase: public.metas
 *
 * Schema esperado:
 *   loja_id (varchar), periodo (varchar '2026-01'), meta (numeric),
 *   empresa_id (uuid)
 *
 * @param {string[]} lojas — IDs das lojas
 * @param {string} periodo — ex: '2026' para o ano inteiro
 * @returns {Promise<Object>} — { loja_id: { '2026-01': valor } }
 */
export async function getMetas(lojas = [], periodo = null) {
  const sb = await _getClient();
  if (!sb) return {};

  let query = sb.from('metas').select('loja_id, periodo, meta');
  if (lojas.length)  query = query.in('loja_id', lojas);
  if (periodo)       query = query.like('periodo', `${periodo}%`);

  const { data, error } = await query;
  if (error) _handleError(error, 'getMetas');

  const result = {};
  (data ?? []).forEach(r => {
    if (!result[r.loja_id]) result[r.loja_id] = {};
    result[r.loja_id][r.periodo] = r.meta ?? 0;
  });
  return result;
}

// ── Helpers ───────────────────────────────────────────────────
const MESES_ABREV = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
function _mesAbrev(mesKey) {
  const m = parseInt(mesKey?.substring(5, 7), 10);
  return MESES_ABREV[m - 1] ?? mesKey;
}
