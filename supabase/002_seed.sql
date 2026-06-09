-- ================================================================
-- OSKLEN INTRANET — Seed de desenvolvimento
-- Migration: 002_seed.sql
--
-- Execute APENAS em ambientes de desenvolvimento/staging.
-- NÃO execute em produção.
--
-- Pré-requisito: 001_schema.sql aplicado.
-- ================================================================

-- ── Empresa ───────────────────────────────────────────────────

INSERT INTO public.empresas (id, nome, slug)
VALUES ('00000000-0000-0000-0000-000000000001', 'Osklen', 'osklen')
ON CONFLICT (slug) DO NOTHING;


-- ── Franquias ─────────────────────────────────────────────────

INSERT INTO public.franquias
  (id, nome, grupo_economico, regional, supervisor, cidade, estado, empresa_id)
VALUES
  ('sp-paulista',  'SP — Paulista',   'Grupo A', 'Sudeste',  'Ana Lima',  'São Paulo',      'SP', '00000000-0000-0000-0000-000000000001'),
  ('rj-barra',     'RJ — Barra',      'Grupo A', 'Sudeste',  'Carlos M.', 'Rio de Janeiro', 'RJ', '00000000-0000-0000-0000-000000000001'),
  ('bh-savassi',   'BH — Savassi',    'Grupo B', 'Sudeste',  'Ana Lima',  'Belo Horizonte', 'MG', '00000000-0000-0000-0000-000000000001'),
  ('ctb-centro',   'CTB — Centro',    'Grupo B', 'Sul',      'Pedro S.',  'Curitiba',       'PR', '00000000-0000-0000-0000-000000000001'),
  ('poa-moinhos',  'POA — Moinhos',   'Grupo C', 'Sul',      'Pedro S.',  'Porto Alegre',   'RS', '00000000-0000-0000-0000-000000000001'),
  ('sp-iguatemi',  'SP — Iguatemi',   'Grupo A', 'Sudeste',  'Carlos M.', 'São Paulo',      'SP', '00000000-0000-0000-0000-000000000001'),
  ('rj-ipanema',   'RJ — Ipanema',    'Grupo A', 'Sudeste',  'Ana Lima',  'Rio de Janeiro', 'RJ', '00000000-0000-0000-0000-000000000001'),
  ('for-meireles', 'FOR — Meireles',  'Grupo C', 'Nordeste', 'Lara V.',   'Fortaleza',      'CE', '00000000-0000-0000-0000-000000000001'),
  ('rec-boa',      'REC — Boa Viagem','Grupo C', 'Nordeste', 'Lara V.',   'Recife',         'PE', '00000000-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;


-- ── Faturamento mensal ────────────────────────────────────────

INSERT INTO public.faturamento_mensal (mes, faturamento, meta, empresa_id)
VALUES
  ('2026-01', 1820000, 1900000, '00000000-0000-0000-0000-000000000001'),
  ('2026-02', 1750000, 1800000, '00000000-0000-0000-0000-000000000001'),
  ('2026-03', 2100000, 1950000, '00000000-0000-0000-0000-000000000001'),
  ('2026-04', 2250000, 2100000, '00000000-0000-0000-0000-000000000001'),
  ('2026-05', 2040000, 2000000, '00000000-0000-0000-0000-000000000001'),
  ('2026-06', 2600000, 2200000, '00000000-0000-0000-0000-000000000001')
ON CONFLICT (mes, empresa_id) DO UPDATE
  SET faturamento = EXCLUDED.faturamento, meta = EXCLUDED.meta;


-- ── Faturamento por franquia ──────────────────────────────────

INSERT INTO public.faturamento_franquia (franquia_id, mes, faturamento, empresa_id)
VALUES
  -- SP Paulista
  ('sp-paulista', '2026-01',  52000, '00000000-0000-0000-0000-000000000001'),
  ('sp-paulista', '2026-02',  48000, '00000000-0000-0000-0000-000000000001'),
  ('sp-paulista', '2026-03',  61000, '00000000-0000-0000-0000-000000000001'),
  ('sp-paulista', '2026-04',  67000, '00000000-0000-0000-0000-000000000001'),
  ('sp-paulista', '2026-05',  59000, '00000000-0000-0000-0000-000000000001'),
  ('sp-paulista', '2026-06',  72000, '00000000-0000-0000-0000-000000000001'),
  -- RJ Barra
  ('rj-barra',    '2026-01',  48000, '00000000-0000-0000-0000-000000000001'),
  ('rj-barra',    '2026-02',  45000, '00000000-0000-0000-0000-000000000001'),
  ('rj-barra',    '2026-03',  55000, '00000000-0000-0000-0000-000000000001'),
  ('rj-barra',    '2026-04',  62000, '00000000-0000-0000-0000-000000000001'),
  ('rj-barra',    '2026-05',  53000, '00000000-0000-0000-0000-000000000001'),
  ('rj-barra',    '2026-06',  65000, '00000000-0000-0000-0000-000000000001')
ON CONFLICT (franquia_id, mes) DO UPDATE
  SET faturamento = EXCLUDED.faturamento;


-- ── Metas por loja ────────────────────────────────────────────

INSERT INTO public.metas (loja_id, periodo, meta, empresa_id)
VALUES
  ('sp-paulista',  '2026-01', 50000, '00000000-0000-0000-0000-000000000001'),
  ('sp-paulista',  '2026-02', 48000, '00000000-0000-0000-0000-000000000001'),
  ('sp-paulista',  '2026-03', 55000, '00000000-0000-0000-0000-000000000001'),
  ('sp-paulista',  '2026-04', 60000, '00000000-0000-0000-0000-000000000001'),
  ('sp-paulista',  '2026-05', 57000, '00000000-0000-0000-0000-000000000001'),
  ('sp-paulista',  '2026-06', 65000, '00000000-0000-0000-0000-000000000001'),
  ('rj-barra',     '2026-01', 47000, '00000000-0000-0000-0000-000000000001'),
  ('rj-barra',     '2026-02', 45000, '00000000-0000-0000-0000-000000000001'),
  ('rj-barra',     '2026-03', 52000, '00000000-0000-0000-0000-000000000001'),
  ('rj-barra',     '2026-04', 58000, '00000000-0000-0000-0000-000000000001'),
  ('rj-barra',     '2026-05', 50000, '00000000-0000-0000-0000-000000000001'),
  ('rj-barra',     '2026-06', 62000, '00000000-0000-0000-0000-000000000001'),
  ('bh-savassi',   '2026-01', 43000, '00000000-0000-0000-0000-000000000001'),
  ('ctb-centro',   '2026-01', 35000, '00000000-0000-0000-0000-000000000001'),
  ('poa-moinhos',  '2026-01', 28000, '00000000-0000-0000-0000-000000000001'),
  ('sp-iguatemi',  '2026-01', 46000, '00000000-0000-0000-0000-000000000001'),
  ('rj-ipanema',   '2026-01', 34000, '00000000-0000-0000-0000-000000000001'),
  ('for-meireles', '2026-01', 25000, '00000000-0000-0000-0000-000000000001'),
  ('rec-boa',      '2026-01', 23000, '00000000-0000-0000-0000-000000000001')
ON CONFLICT (loja_id, periodo) DO UPDATE
  SET meta = EXCLUDED.meta;
