/**
 * OSKLEN INTRANET — Página: Painel Geral
 *
 * Fonte de dados: Supabase (padrão) OU planilha XLSX importada manualmente.
 * db.meta.source indica a origem ativa em qualquer momento.
 *
 * Módulos desta página (integrados na Onda 2):
 *   - Visão Geral (ativo)
 *   - Crescimento (O2-C)
 *   - Devoluções  (O2-D)
 */

import { getKPIs, getFranquias, getFaturamentoMensal } from '../services/dataService.js';
import filtersStore from '../store/filtersStore.js';
import eventBus from '../store/eventBus.js';
import { formatBRL, formatPct, badgeFromPct, colorFromPct, formatN, formatDate } from '../utils/formatters.js';
import xlsxService from '../services/xlsxService.js';

// ── Estado da página ──────────────────────────────────────────────
let _charts = {};
let _unsubFilters = null;
let _el = null;

// DB local — preenchido pelo parser XLSX ou mantido null (usa Supabase)
let _db = null;

// ─────────────────────────────────────────────────────────────────
// ParseError — O1-B
// ─────────────────────────────────────────────────────────────────

export class ParseError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name    = 'ParseError';
    this.details = details;
  }
}

// ─────────────────────────────────────────────────────────────────
// parsePainelGeralXLSX — O1-B
// Regra de ouro: tudo ou nada. Lança ParseError antes de qualquer parse.
// ─────────────────────────────────────────────────────────────────

const ABAS_OBRIGATORIAS = ['FATURAMENTO', 'DEVOLUTION', 'PO', 'VALIDACAO_DADOS'];

const COLUNAS_OBRIGATORIAS = {
  FATURAMENTO:     ['nome_clifor', 'emissao', 'valor_liquido', 'qtde'],
  DEVOLUTION:      ['nome_clifor', 'recebimento', 'valor', 'qtde'],
  PO:              ['FRANQUIAS', 'JANEIRO'],
  VALIDACAO_DADOS: ['FRANQUIAS', 'LOJA', 'FRANQUEADO', 'SUPERVISOR', 'REGIONAL'],
};

const MIN_LINHAS = {
  FATURAMENTO:     1,
  DEVOLUTION:      0, // pode estar vazia — sem devoluções é válido
  PO:              1,
  VALIDACAO_DADOS: 1,
};

const MESES_PO = ['JANEIRO','FEVEREIRO','MARCO','ABRIL','MAIO','JUNHO',
                  'JULHO','AGOSTO','SETEMBRO','OUTUBRO','NOVEMBRO','DEZEMBRO'];

/**
 * Faz parse do workbook do Painel Geral.
 * Executa as 4 etapas de validação antes de qualquer parse.
 * Retorna PainelGeralDB completo ou lança ParseError.
 *
 * @param {Object} workbook — retornado por xlsxService.fromFile()
 * @param {string} fileName — nome do arquivo para o meta
 * @returns {PainelGeralDB}
 * @throws {ParseError}
 */
export function parsePainelGeralXLSX(workbook, fileName = '') {

  // ── Etapa 1: abas presentes ─────────────────────────────────
  const abasPresentes = workbook.SheetNames.map(n => n.trim().toUpperCase());
  const abasFaltando  = ABAS_OBRIGATORIAS.filter(a => !abasPresentes.includes(a));

  if (abasFaltando.length > 0) {
    throw new ParseError(
      `Arquivo inválido: ${abasFaltando.length} aba(s) obrigatória(s) não encontrada(s).`,
      { missingSheets: abasFaltando, presentSheets: workbook.SheetNames }
    );
  }

  // Mapear nome real da aba (preservando capitalização original)
  const abaReal = {};
  for (const nome of workbook.SheetNames) {
    abaReal[nome.trim().toUpperCase()] = nome;
  }

  // ── Etapa 2: abas não-vazias ────────────────────────────────
  for (const aba of ABAS_OBRIGATORIAS) {
    const sheet = workbook.Sheets[abaReal[aba]];
    if (!sheet?.['!ref']) {
      throw new ParseError(
        `A aba "${aba}" está vazia.`,
        { emptySheet: aba }
      );
    }
  }

  // ── Etapa 3: colunas obrigatórias ──────────────────────────
  for (const [aba, colunas] of Object.entries(COLUNAS_OBRIGATORIAS)) {
    const rows   = xlsxService.sheetToMatrix(workbook, abaReal[aba]);
    const header = (rows[0] || []).map(c => String(c ?? '').trim().toUpperCase());
    const faltando = colunas
      .map(c => c.toUpperCase())
      .filter(c => !header.includes(c));

    if (faltando.length > 0) {
      throw new ParseError(
        `A aba "${aba}" está com estrutura inválida — colunas não encontradas: ${faltando.join(', ')}`,
        { sheet: aba, missingColumns: faltando, foundColumns: header }
      );
    }
  }

  // ── Etapa 4: volume mínimo ──────────────────────────────────
  for (const [aba, min] of Object.entries(MIN_LINHAS)) {
    if (min === 0) continue;
    const rows = xlsxService.sheetToJSON(workbook, abaReal[aba]);
    if (rows.length < min) {
      throw new ParseError(
        `A aba "${aba}" não contém dados suficientes (${rows.length} linha(s) encontrada(s), mínimo: ${min}).`,
        { sheet: aba, rowCount: rows.length, required: min }
      );
    }
  }

  // ── PARSE (só chega aqui se todas as 4 etapas passaram) ────

  // 1. VALIDACAO_DADOS → vmap para enriquecer as outras abas
  const vmap = _parseValidacao(workbook, abaReal['VALIDACAO_DADOS']);

  // 2. FATURAMENTO
  const faturamento = _parseFaturamento(workbook, abaReal['FATURAMENTO'], vmap);

  // 3. DEVOLUTION
  const devolucoes = _parseDevolucoes(workbook, abaReal['DEVOLUTION'], vmap);

  // 4. PO + Forecast
  const { po, forecast } = _parsePO(workbook, abaReal['PO']);

  // 5. Meta
  const meta = _buildMeta(faturamento, fileName);

  return { faturamento, devolucoes, po, forecast, validacao: Object.values(vmap), meta };
}

// ─────────────────────────────────────────────────────────────────
// Parsers internos
// ─────────────────────────────────────────────────────────────────

function _parseValidacao(wb, nomAba) {
  const rows = xlsxService.sheetToJSON(wb, nomAba);
  const vmap = {};
  for (const r of rows) {
    const franquia = String(r.FRANQUIAS || r.franquias || '').trim();
    if (!franquia.startsWith('FRANQUIA')) continue;
    vmap[franquia] = {
      franquia,
      loja:       String(r.LOJA        || r.loja        || '').trim(),
      franqueado: String(r.FRANQUEADO  || r.franqueado  || '').trim(),
      supervisor: String(r.SUPERVISOR  || r.supervisor  || '').trim(),
      regional:   String(r.REGIONAL    || r.regional    || '').trim(),
    };
  }
  return vmap;
}

function _parseFaturamento(wb, nomAba, vmap) {
  const rows = xlsxService.sheetToJSON(wb, nomAba);
  const result = [];

  for (const r of rows) {
    const franquia = String(r.nome_clifor || '').trim();
    const emissao  = r.emissao ? new Date(r.emissao) : null;
    if (!franquia || !emissao || isNaN(emissao)) continue;

    const valor = parseFloat(r.valor_liquido) || 0;
    if (valor <= 0) continue;

    const vm  = vmap[franquia] || {};
    const ref = String(r.refer_fabricante || '').toUpperCase();
    const pvUnit = parseFloat(r.PRECO_VENDA) || 0;
    const qtde   = parseInt(r.qtde) || 0;

    result.push({
      franquia,
      loja:       vm.loja       || '',
      franqueado: vm.franqueado || '',
      supervisor: vm.supervisor || '',
      regional:   vm.regional   || '',
      ano:        emissao.getFullYear(),
      mes:        emissao.getMonth() + 1,
      grupo:      String(r.grupo_produto   || '').trim(),
      genero:     String(r.desc_sexo_tipo  || '').trim(),
      lei_moda:   ref.includes('TERRAS') ? 'NAO' : ref.includes('TALHOS') ? 'SIM' : '',
      valor:      Math.round(valor * 100) / 100,
      qtde,
      custo:      Math.round((parseFloat(r.custo_na_data) || 0) * qtde * 100) / 100,
      pv:         Math.round(pvUnit * qtde * 100) / 100,
      pvq:        pvUnit > 0 ? qtde : 0,
    });
  }

  return result;
}

function _parseDevolucoes(wb, nomAba, vmap) {
  const rows = xlsxService.sheetToJSON(wb, nomAba);
  const result = [];

  for (const r of rows) {
    const franquia    = String(r.nome_clifor || '').trim();
    const recebimento = r.recebimento ? new Date(r.recebimento) : null;
    if (!franquia || !recebimento || isNaN(recebimento)) continue;

    const vm = vmap[franquia] || {};
    result.push({
      franquia,
      loja:       vm.loja       || '',
      franqueado: vm.franqueado || '',
      supervisor: vm.supervisor || '',
      regional:   vm.regional   || '',
      ano:        recebimento.getFullYear(),
      mes:        recebimento.getMonth() + 1,
      grupo:      String(r.grupo_produto || '').trim(),
      valor:      Math.round((parseFloat(r.valor) || 0) * 100) / 100,
      qtde:       parseInt(r.qtde) || 0,
    });
  }

  return result;
}

function _parsePO(wb, nomAba) {
  const rows     = xlsxService.sheetToJSON(wb, nomAba);
  const po       = [];
  const forecast = {};

  for (const r of rows) {
    const franquia = String(r.FRANQUIAS || r.franquias || '').trim();

    // Linha de PO por franquia
    if (franquia.startsWith('FRANQUIA') && franquia !== 'TOTAL GERAL') {
      MESES_PO.forEach((nomeMes, idx) => {
        const val = parseFloat(r[nomeMes]) || 0;
        if (val > 0) {
          po.push({ franquia, mes: idx + 1, po: val });
        }
      });
    }

    // Linha de Forecast (coluna FORECAST contém o nome do mês)
    const fc = String(r.FORECAST || '').trim().toUpperCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, ''); // remove acentos
    const fcMes = MESES_PO.indexOf(fc);
    if (fcMes !== -1) {
      const val = parseFloat(r.VALOR) || 0;
      if (val > 0) forecast[fcMes + 1] = val;
    }
  }

  return { po, forecast };
}

function _buildMeta(faturamento, fileName) {
  const anos  = faturamento.map(r => r.ano);
  const meses = faturamento.map(r => r.mes);
  const minAno = Math.min(...anos);
  const maxAno = Math.max(...anos);
  // periodStart = primeiro mês do dataset
  const minMes = faturamento
    .filter(r => r.ano === minAno)
    .reduce((m, r) => Math.min(m, r.mes), 12);
  // periodEnd = último dia do último mês
  const maxMes = faturamento
    .filter(r => r.ano === maxAno)
    .reduce((m, r) => Math.max(m, r.mes), 1);
  const lastDay = new Date(maxAno, maxMes, 0).getDate(); // dia 0 do mês seguinte = último dia do mês atual

  const franquias = new Set(faturamento.map(r => r.franquia));

  return {
    source:         'xlsx',
    fileName:       fileName,
    importedAt:     new Date().toISOString().substring(0, 19),
    totalFranquias: franquias.size,
    totalRegistros: faturamento.length,
    periodStart:    `${minAno}-${String(minMes).padStart(2,'0')}-01`,
    periodEnd:      `${maxAno}-${String(maxMes).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`,
  };
}

// ─────────────────────────────────────────────────────────────────
// Zona de upload — handler e mensagens amigáveis
// ─────────────────────────────────────────────────────────────────

async function _handleUpload(file) {
  _setUploadState('loading', 'Processando planilha…');

  let workbook;

  // Etapa 0: ler o arquivo (corrupção / formato inválido)
  try {
    workbook = await xlsxService.fromFile(file);
  } catch (_) {
    _setUploadState('error',
      'Não foi possível ler o arquivo.',
      'O arquivo pode estar corrompido ou não é um Excel válido (.xlsx / .xls).'
    );
    return;
  }

  // Etapas 1–4: validação + parse
  let db;
  try {
    db = parsePainelGeralXLSX(workbook, file.name);
  } catch (err) {
    if (err instanceof ParseError) {
      _setUploadState('error', _buildUserMessage(err));
    } else {
      _setUploadState('error', 'Erro inesperado ao processar o arquivo.');
      console.error('[PainelGeral] parse error:', err);
    }
    // Invariante: estado anterior inalterado
    return;
  }

  // Sucesso — aplicar DB e re-renderizar
  _db = db;
  _setUploadState('success',
    `✅ ${file.name}`,
    `${formatDate(db.meta.periodStart)} – ${formatDate(db.meta.periodEnd)} · ` +
    `${db.meta.totalFranquias} franquias · ${formatN(db.meta.totalRegistros)} registros · ` +
    `importado às ${db.meta.importedAt.substring(11, 16)}`
  );

  await _render();
}

/**
 * Constrói a mensagem de erro amigável a partir de um ParseError.
 */
function _buildUserMessage(err) {
  const d = err.details || {};

  if (d.missingSheets) {
    return (
      `Faltam as abas obrigatórias: ${d.missingSheets.join(', ')}\n\n` +
      `Abas encontradas: ${(d.presentSheets || []).join(', ')}\n\n` +
      `Verifique se selecionou o arquivo correto. O arquivo deve ser o "Atualizado_em_*.xlsx".`
    );
  }
  if (d.emptySheet) {
    return (
      `A aba "${d.emptySheet}" está vazia.\n\n` +
      `O arquivo pode estar incompleto ou ter sido exportado incorretamente.`
    );
  }
  if (d.missingColumns) {
    return (
      `A aba "${d.sheet}" está com colunas ausentes: ${d.missingColumns.join(', ')}\n\n` +
      `Isso geralmente ocorre quando o arquivo foi editado manualmente ou exportado ` +
      `de uma versão diferente do sistema.`
    );
  }
  if (d.rowCount !== undefined) {
    return (
      `A aba "${d.sheet}" não contém dados suficientes (${d.rowCount} linha(s)).\n\n` +
      `O arquivo pode ter sido exportado antes do preenchimento dos dados.`
    );
  }

  return err.message;
}

function _setUploadState(state, primary, secondary = '') {
  const statusEl = _el?.querySelector('#pg-upload-status');
  const detailEl = _el?.querySelector('#pg-upload-detail');
  const errorEl  = _el?.querySelector('#pg-upload-error');
  const spinEl   = _el?.querySelector('#pg-upload-spinner');

  if (spinEl)  spinEl.style.display  = state === 'loading' ? 'inline-block' : 'none';
  if (errorEl) errorEl.style.display = state === 'error'   ? 'block' : 'none';

  if (statusEl) statusEl.textContent = state === 'loading' ? primary : (state === 'success' ? primary : '');
  if (detailEl) detailEl.textContent = secondary;

  if (state === 'error' && errorEl) {
    errorEl.textContent = primary + (secondary ? '\n' + secondary : '');
  }
}

// ── HTML da zona de upload ────────────────────────────────────────

function _uploadZoneHTML() {
  return `
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-lg);padding:12px 18px;margin-bottom:20px;display:flex;align-items:flex-start;gap:16px;flex-wrap:wrap">
      <div style="display:flex;flex-direction:column;gap:4px;flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          <span style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.07em;color:var(--gray-500)">Fonte de dados</span>
          <div class="spinner" id="pg-upload-spinner" style="display:none;width:14px;height:14px;border-width:1.5px"></div>
          <span id="pg-upload-status" style="font-size:12px;color:var(--gray-700)">Supabase</span>
        </div>
        <div id="pg-upload-detail" style="font-size:11px;color:var(--gray-500)"></div>
        <div id="pg-upload-error"
          style="display:none;font-size:12px;color:var(--red);background:var(--red-bg);
                 border:1px solid #f5c0c0;border-radius:var(--radius-md);padding:8px 12px;
                 margin-top:6px;white-space:pre-line;line-height:1.6"></div>
      </div>
      <div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end;flex-shrink:0">
        <label style="display:inline-flex;align-items:center;gap:6px;padding:6px 14px;
               background:var(--black);color:#fff;border-radius:var(--radius-md);
               font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap">
          <i class="ti ti-upload" style="font-size:13px"></i>Importar planilha
          <input type="file" accept=".xlsx,.xls" id="pg-file-input" style="display:none">
        </label>
        <span style="font-size:10px;color:var(--gray-400)">Atualizado_em_*.xlsx</span>
      </div>
    </div>
  `;
}

// ─────────────────────────────────────────────────────────────────
// Contrato público da página
// ─────────────────────────────────────────────────────────────────

export async function mount(el) {
  _el = el;
  el.innerHTML = _uploadZoneHTML() + _skeleton();

  // Bind do input de arquivo
  el.querySelector('#pg-file-input')?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (file) _handleUpload(file);
    e.target.value = ''; // permite re-selecionar o mesmo arquivo
  });

  try {
    await _render();
  } catch (err) {
    el.querySelector('#pg-content')?.remove?.();
    el.insertAdjacentHTML('beforeend', _errorState(err.message));
    return;
  }

  _unsubFilters = filtersStore.subscribe(() => refresh());
  eventBus.on('data:refresh', refresh);
}

export function unmount() {
  Object.values(_charts).forEach(c => { try { c.destroy(); } catch(_) {} });
  _charts = {};
  if (_unsubFilters) { _unsubFilters(); _unsubFilters = null; }
  eventBus.off('data:refresh', refresh);
  _db  = null;
  _el  = null;
}

export async function refresh() {
  if (!_el) return;
  await _render();
}

export function onFilterChange() { refresh(); }

// ─────────────────────────────────────────────────────────────────
// Renderização (Supabase OU XLSX — transparente para a UI)
// ─────────────────────────────────────────────────────────────────

async function _render() {
  // Se há DB local (XLSX importado), usar — senão buscar do Supabase
  const [kpis, franquias, mensal] = _db
    ? _kpisFromDB(_db)
    : await Promise.all([
        getKPIs(filtersStore.get()),
        getFranquias(filtersStore.get()),
        getFaturamentoMensal(filtersStore.get()),
      ]);

  if (!_el) return;

  // Atualizar label de fonte no upload zone
  if (_db?.meta) {
    const statusEl = _el.querySelector('#pg-upload-status');
    if (statusEl && !statusEl.textContent.startsWith('✅')) {
      statusEl.textContent = `✅ ${_db.meta.fileName}`;
      const detailEl = _el.querySelector('#pg-upload-detail');
      if (detailEl) {
        detailEl.textContent =
          `${formatDate(_db.meta.periodStart)} – ${formatDate(_db.meta.periodEnd)} · ` +
          `${_db.meta.totalFranquias} franquias · ${formatN(_db.meta.totalRegistros)} registros`;
      }
    }
  }

  const contentHTML = `
    <div id="pg-content" class="fade-in">
      ${_renderKPIs(Array.isArray(kpis) ? _calcKPIs(kpis) : kpis)}
      <div class="row-2">
        ${_renderChartCard('Faturamento mensal', 'chart-mensal', 'h-280')}
        ${_renderRankingCard(franquias)}
      </div>
      ${_renderFranquiasTable(franquias)}
    </div>
  `;

  const existing = _el.querySelector('#pg-content');
  if (existing) {
    existing.outerHTML = contentHTML;
  } else {
    _el.insertAdjacentHTML('beforeend', contentHTML);
  }

  _buildChartMensal(Array.isArray(mensal) ? mensal : mensal);
}

/**
 * Quando há DB local, deriva kpis, franquias e mensal diretamente.
 * Retorna [kpisObj, franquiasArr, mensalArr] — mesma forma do Supabase.
 */
function _kpisFromDB(db) {
  const fat26 = db.faturamento.filter(r => r.ano === 2026);
  const byLoja = {};
  for (const r of fat26) {
    if (!byLoja[r.loja]) byLoja[r.loja] = { id: r.loja, nome: r.loja, grupo: r.franqueado, regional: r.regional, supervisor: r.supervisor, faturamento: 0, meta: 0 };
    byLoja[r.loja].faturamento += r.valor;
  }
  // Meta PO por loja
  for (const p of db.po) {
    const loja = db.validacao.find(v => v.franquia === p.franquia)?.loja || '';
    if (loja && byLoja[loja]) byLoja[loja].meta += p.po;
  }

  const franquias = Object.values(byLoja)
    .map(f => ({ ...f, atingimento: f.meta > 0 ? Math.round(f.faturamento / f.meta * 1000) / 10 : 0 }))
    .sort((a, b) => b.faturamento - a.faturamento);

  const kpis = _calcKPIs(franquias);

  // Faturamento mensal agregado
  const byMes = {};
  for (const r of fat26) {
    const k = `2026-${String(r.mes).padStart(2,'0')}`;
    if (!byMes[k]) byMes[k] = { mes: k, faturamento: 0, meta: 0 };
    byMes[k].faturamento += r.valor;
  }
  const MESES_ABREV = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  const mensal = Object.values(byMes)
    .sort((a, b) => a.mes.localeCompare(b.mes))
    .map(m => ({ mes: MESES_ABREV[parseInt(m.mes.split('-')[1]) - 1], faturamento: m.faturamento, meta: m.meta }));

  return [kpis, franquias, mensal];
}

function _calcKPIs(franquias) {
  const totalFat  = franquias.reduce((s, f) => s + (f.faturamento || 0), 0);
  const totalMeta = franquias.reduce((s, f) => s + (f.meta || 0), 0);
  return {
    faturamento:  totalFat,
    meta:         totalMeta,
    atingimento:  totalMeta > 0 ? Math.round(totalFat / totalMeta * 1000) / 10 : 0,
    total_lojas:  franquias.length,
    lojas_acima:  franquias.filter(f => (f.atingimento || 0) >= 100).length,
    lojas_abaixo: franquias.filter(f => (f.atingimento || 0) < 80).length,
  };
}

// ─────────────────────────────────────────────────────────────────
// Componentes de renderização (inalterados da Fase 1)
// ─────────────────────────────────────────────────────────────────

function _renderKPIs(kpis) {
  const badge = badgeFromPct(kpis.atingimento);
  return `
    <div class="kpi-grid kpi-grid-4" style="margin-bottom:20px">
      <div class="kpi-card">
        <div class="kpi-label"><i class="ti ti-currency-real" aria-hidden="true"></i>Faturamento</div>
        <div class="kpi-value">${formatBRL(kpis.faturamento, true)}</div>
        <div class="kpi-sub"><span class="badge ${badge}">${formatPct(kpis.atingimento)} da meta</span></div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label"><i class="ti ti-target" aria-hidden="true"></i>Meta</div>
        <div class="kpi-value">${formatBRL(kpis.meta, true)}</div>
        <div class="kpi-sub">Período atual</div>
      </div>
      <div class="kpi-card${kpis.lojas_acima > 0 ? ' accent-green' : ''}">
        <div class="kpi-label"><i class="ti ti-building-store" aria-hidden="true"></i>Lojas acima da meta</div>
        <div class="kpi-value">${kpis.lojas_acima}</div>
        <div class="kpi-sub">de ${kpis.total_lojas} lojas</div>
      </div>
      <div class="kpi-card${kpis.lojas_abaixo > 0 ? ' accent-red' : ' accent-green'}">
        <div class="kpi-label"><i class="ti ti-alert-triangle" aria-hidden="true"></i>Lojas abaixo de 80%</div>
        <div class="kpi-value">${kpis.lojas_abaixo}</div>
        <div class="kpi-sub">requerem atenção</div>
      </div>
    </div>
  `;
}

function _renderChartCard(title, canvasId, heightClass) {
  return `
    <div class="card" style="margin-bottom:0">
      <div class="card-header"><div class="card-title">${title}</div></div>
      <div class="chart-wrap ${heightClass}">
        <canvas id="${canvasId}" role="img" aria-label="${title}"></canvas>
      </div>
    </div>
  `;
}

function _renderRankingCard(franquias) {
  const top5  = [...franquias].sort((a,b) => b.faturamento - a.faturamento).slice(0, 5);
  const maxFat = top5[0]?.faturamento ?? 1;
  const items  = top5.map((f, i) => `
    <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border-light)">
      <div class="rank-num ${i < 3 ? 'top' : ''}">${i + 1}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${f.nome}</div>
        <div class="prog-bar" style="margin-top:4px;height:3px">
          <div class="prog-fill" style="width:${Math.round(f.faturamento/maxFat*100)}%"></div>
        </div>
      </div>
      <div style="font-size:12px;font-weight:600;white-space:nowrap">${formatBRL(f.faturamento, true)}</div>
    </div>
  `).join('');
  return `
    <div class="card" style="margin-bottom:0">
      <div class="card-header">
        <div class="card-title">Ranking de lojas</div>
        <div style="font-size:11px;color:var(--gray-500)">por faturamento</div>
      </div>
      ${items}
    </div>
  `;
}

function _renderFranquiasTable(franquias) {
  const rows = franquias.map(f => `
    <tr>
      <td style="font-weight:500">${f.nome}</td>
      <td>${f.grupo || '—'}</td>
      <td>${f.regional || '—'}</td>
      <td class="r">${formatBRL(f.faturamento, true)}</td>
      <td class="r">${formatBRL(f.meta, true)}</td>
      <td class="r">
        <div class="prog-wrap">
          <div class="prog-bar">
            <div class="prog-fill ${f.atingimento >= 100 ? 'green' : f.atingimento >= 80 ? 'amber' : 'red'}"
                 style="width:${Math.min(f.atingimento, 100)}%"></div>
          </div>
          <span class="prog-label ${colorFromPct(f.atingimento)}">${formatPct(f.atingimento)}</span>
        </div>
      </td>
    </tr>
  `).join('');
  return `
    <div class="table-card">
      <div class="table-card-header"><div class="table-card-title">Desempenho por loja</div></div>
      <div class="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Loja</th><th>Grupo</th><th>Regional</th>
              <th class="r">Faturamento</th><th class="r">Meta</th><th class="r">Atingimento</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
  `;
}

function _buildChartMensal(mensal) {
  const canvas = _el?.querySelector('#chart-mensal');
  if (!canvas || !window.Chart) return;
  if (_charts['mensal']) { _charts['mensal'].destroy(); }
  _charts['mensal'] = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: mensal.map(m => m.mes),
      datasets: [
        { label: 'Faturamento', data: mensal.map(m => m.faturamento),
          backgroundColor: mensal.map((_,i) => i === mensal.length-1 ? '#111111' : '#d4d4d4'),
          borderRadius: 4 },
        { label: 'Meta', data: mensal.map(m => m.meta), type: 'line',
          borderColor: '#888888', borderWidth: 1.5, borderDash: [4,4],
          pointRadius: 0, fill: false },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false },
        tooltip: { callbacks: { label: ctx => formatBRL(ctx.raw, true) } } },
      scales: {
        y: { grid: { color: '#f0f0f0' }, ticks: { callback: v => formatBRL(v, true), font: { size: 10 }, color: '#aaa' } },
        x: { grid: { display: false }, ticks: { font: { size: 11 }, color: '#888' } },
      },
    },
  });
}

async function _loadFilterOptions() { /* futuro: popular dropdowns */ }

function _skeleton() {
  return `
    <div id="pg-content">
      <div class="kpi-grid kpi-grid-4" style="margin-bottom:20px">
        ${Array(4).fill('<div class="kpi-card skeleton skeleton-kpi"></div>').join('')}
      </div>
      <div class="row-2">
        <div class="card skeleton" style="height:320px;margin-bottom:0"></div>
        <div class="card skeleton" style="height:320px;margin-bottom:0"></div>
      </div>
    </div>
  `;
}

function _errorState(message) {
  return `
    <div class="empty-state">
      <div class="empty-state-icon"><i class="ti ti-alert-circle"></i></div>
      <div class="empty-state-title">Erro ao carregar dados</div>
      <div class="empty-state-sub">${message}</div>
    </div>
  `;
}
