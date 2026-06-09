/**
 * OSKLEN INTRANET — XlsxService
 *
 * Ponto único de parse de arquivos XLSX/XLS.
 * Centraliza a lógica que estava duplicada em dashboard_vendas,
 * dashboard_faturamento, dashboard_wise e fluxo_pagamentos.
 *
 * Usa a biblioteca XLSX global (carregada uma única vez no index.html).
 *
 * Uso:
 *   import xlsxService from '../services/xlsxService.js';
 *
 *   // A partir de um input[type=file]
 *   const workbook = await xlsxService.fromFile(file);
 *
 *   // Ler aba como array de objetos (header na linha 1)
 *   const rows = xlsxService.sheetToJSON(workbook, 'NomeAba');
 *
 *   // Ler aba como array de arrays (raw)
 *   const matrix = xlsxService.sheetToMatrix(workbook, 'NomeAba');
 *
 *   // Verificar se abas necessárias existem
 *   xlsxService.requireSheets(workbook, ['ABA1', 'ABA2']);
 */

class XlsxService {
  /**
   * Lê um File e retorna um Workbook do XLSX.
   * @param {File} file
   * @returns {Promise<Object>} workbook
   */
  async fromFile(file) {
    if (!window.XLSX) throw new Error('Biblioteca XLSX não carregada.');
    const buffer = await file.arrayBuffer();
    return XLSX.read(buffer, { type: 'array', cellDates: true });
  }

  /**
   * Converte uma aba do workbook em array de objetos.
   * A primeira linha é usada como header (chaves dos objetos).
   * @param {Object} workbook
   * @param {string|number} sheetNameOrIndex — nome ou índice da aba (0-based)
   * @param {Object} options — opções extras do XLSX.utils.sheet_to_json
   * @returns {Array<Object>}
   */
  sheetToJSON(workbook, sheetNameOrIndex = 0, options = {}) {
    const sheet = this._getSheet(workbook, sheetNameOrIndex);
    return XLSX.utils.sheet_to_json(sheet, { defval: '', ...options });
  }

  /**
   * Converte uma aba em array de arrays (sem header automático).
   * @param {Object} workbook
   * @param {string|number} sheetNameOrIndex
   * @returns {Array<Array>}
   */
  sheetToMatrix(workbook, sheetNameOrIndex = 0) {
    const sheet = this._getSheet(workbook, sheetNameOrIndex);
    return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  }

  /**
   * Retorna os nomes de todas as abas do workbook.
   * @param {Object} workbook
   * @returns {string[]}
   */
  getSheetNames(workbook) {
    return workbook.SheetNames ?? [];
  }

  /**
   * Verifica se as abas obrigatórias existem. Lança erro se alguma faltar.
   * Aceita strings parciais (ex: 'WISE' encontra 'WISE - PROD POR CLIENTE').
   * @param {Object} workbook
   * @param {string[]} required — nomes ou substrings dos nomes
   * @throws {Error}
   */
  requireSheets(workbook, required) {
    const names  = this.getSheetNames(workbook);
    const missing = required.filter(r =>
      !names.some(n => n.toUpperCase().includes(r.toUpperCase()))
    );
    if (missing.length > 0) {
      throw new Error(
        `Abas obrigatórias não encontradas: ${missing.join(', ')}.\n` +
        `Abas presentes: ${names.join(', ')}`
      );
    }
  }

  /**
   * Encontra uma aba por nome parcial (case-insensitive).
   * @param {Object} workbook
   * @param {string} partial
   * @returns {string|null} nome exato da aba
   */
  findSheet(workbook, partial) {
    return this.getSheetNames(workbook).find(n =>
      n.toUpperCase().includes(partial.toUpperCase())
    ) ?? null;
  }

  /**
   * Normaliza as chaves de um objeto (remove acentos, spaces → underscore).
   * Útil ao processar planilhas com headers em português.
   * @param {Object} row
   * @returns {Object}
   */
  normalizeKeys(row) {
    const out = {};
    for (const [k, v] of Object.entries(row)) {
      const key = k.trim()
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, '_')
        .replace(/[^a-z0-9_]/g, '');
      out[key] = v instanceof Date ? v.toISOString().split('T')[0] : v;
    }
    return out;
  }

  /** @private */
  _getSheet(workbook, nameOrIndex) {
    const name = typeof nameOrIndex === 'number'
      ? workbook.SheetNames[nameOrIndex]
      : nameOrIndex;
    const sheet = workbook.Sheets[name];
    if (!sheet) throw new Error(`Aba "${nameOrIndex}" não encontrada no arquivo.`);
    return sheet;
  }
}

const xlsxService = new XlsxService();
export default xlsxService;
