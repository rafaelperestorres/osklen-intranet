/**
 * OSKLEN INTRANET — Configuração Central da Aplicação
 * Fase 2: todas as páginas ativas.
 */

export const APP = {
  name:    'OSKLEN',
  tagline: 'Intranet',
  version: '2.0.0',
};

export const ROUTES = [
  { id:'painel-geral', label:'Painel Geral',          icon:'ti-layout-dashboard',      section:'Visão Geral', module:'/pages/PainelGeral.js' },
  { id:'vendas',       label:'Vendas',                 icon:'ti-shopping-bag',          section:'Comercial',   module:'/pages/Vendas.js' },
  { id:'faturamento',  label:'Faturamento',            icon:'ti-receipt',               section:'Comercial',   module:'/pages/Faturamento.js' },
  { id:'wise',         label:'Dashboard Wise',         icon:'ti-chart-bar',             section:'Comercial',   module:'/pages/Wise.js' },
  { id:'pagamentos',   label:'Fluxo de Pagamentos',    icon:'ti-cash',                  section:'Operacional', module:'/pages/Pagamentos.js' },
  { id:'estoque',      label:'Estoque',                icon:'ti-package',               section:'Operacional', module:'/pages/Estoque.js' },
  { id:'dre',          label:'DRE',                    icon:'ti-file-analytics',        section:'Financeiro',  module:'/pages/DRE.js',       pending:true },
  { id:'fluxo-caixa',  label:'Fluxo de Caixa',        icon:'ti-arrows-exchange',       section:'Financeiro',  module:'/pages/FluxoCaixa.js',pending:true },
  { id:'indicadores',  label:'Indicadores Exec.',      icon:'ti-presentation-analytics',section:'Executivo',   module:'/pages/Indicadores.js',pending:true },
];

export const DEFAULT_ROUTE = 'painel-geral';
