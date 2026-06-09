-- ================================================================
-- OSKLEN INTRANET — Supabase Schema
-- Migration: 001_schema.sql
--
-- Execute no SQL Editor do Supabase ou via supabase db push.
-- Ordem: extensões → tabelas → índices → RLS → policies → funções
-- ================================================================

-- ── Extensões ────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- busca fuzzy em nomes


-- ================================================================
-- TABELAS
-- ================================================================

-- ── Empresas (multiempresa) ───────────────────────────────────
-- Cada empresa tem seu próprio silo de dados via RLS.

CREATE TABLE IF NOT EXISTS public.empresas (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome        text NOT NULL,
  slug        text UNIQUE NOT NULL,   -- ex: 'osklen'
  ativo       boolean DEFAULT true,
  criado_em   timestamptz DEFAULT now()
);

COMMENT ON TABLE public.empresas IS 'Empresas cadastradas. Raiz do controle multiempresa.';


-- ── Franquias ─────────────────────────────────────────────────
-- Cadastro de todas as lojas/franquias.

CREATE TABLE IF NOT EXISTS public.franquias (
  id               text PRIMARY KEY,          -- ex: 'sp-paulista'
  nome             text NOT NULL,
  grupo_economico  text,                      -- ex: 'Grupo A'
  regional         text,
  supervisor       text,
  cidade           text,
  estado           char(2),
  ativo            boolean DEFAULT true,
  empresa_id       uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  criado_em        timestamptz DEFAULT now(),
  atualizado_em    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_franquias_empresa    ON public.franquias(empresa_id);
CREATE INDEX IF NOT EXISTS idx_franquias_regional   ON public.franquias(regional);
CREATE INDEX IF NOT EXISTS idx_franquias_grupo      ON public.franquias(grupo_economico);
CREATE INDEX IF NOT EXISTS idx_franquias_nome_trgm  ON public.franquias USING gin(nome gin_trgm_ops);

COMMENT ON TABLE public.franquias IS 'Cadastro de franquias/lojas. Filtrada por empresa_id via RLS.';


-- ── Faturamento mensal ────────────────────────────────────────
-- Série temporal de faturamento agregado por mês.

CREATE TABLE IF NOT EXISTS public.faturamento_mensal (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  mes          varchar(7) NOT NULL,  -- ex: '2026-01'
  faturamento  numeric(15,2) DEFAULT 0,
  meta         numeric(15,2) DEFAULT 0,
  empresa_id   uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  UNIQUE (mes, empresa_id)
);

CREATE INDEX IF NOT EXISTS idx_fat_mensal_empresa ON public.faturamento_mensal(empresa_id);
CREATE INDEX IF NOT EXISTS idx_fat_mensal_mes     ON public.faturamento_mensal(mes);

COMMENT ON TABLE public.faturamento_mensal
  IS 'Faturamento e meta consolidados por mês. Alimenta gráfico do Painel Geral.';


-- ── Faturamento por franquia ──────────────────────────────────
-- Faturamento individual de cada franquia por mês.

CREATE TABLE IF NOT EXISTS public.faturamento_franquia (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  franquia_id  text NOT NULL REFERENCES public.franquias(id) ON DELETE CASCADE,
  mes          varchar(7) NOT NULL,  -- ex: '2026-01'
  faturamento  numeric(15,2) DEFAULT 0,
  empresa_id   uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  UNIQUE (franquia_id, mes)
);

CREATE INDEX IF NOT EXISTS idx_fat_franquia_empresa  ON public.faturamento_franquia(empresa_id);
CREATE INDEX IF NOT EXISTS idx_fat_franquia_mes      ON public.faturamento_franquia(mes);
CREATE INDEX IF NOT EXISTS idx_fat_franquia_id       ON public.faturamento_franquia(franquia_id);

COMMENT ON TABLE public.faturamento_franquia
  IS 'Faturamento por franquia e mês. Join com franquias para filtros dimensionais.';


-- ── Metas ────────────────────────────────────────────────────
-- Meta individual por loja e período mensal.

CREATE TABLE IF NOT EXISTS public.metas (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  loja_id      text NOT NULL REFERENCES public.franquias(id) ON DELETE CASCADE,
  periodo      varchar(7) NOT NULL,  -- ex: '2026-01'
  meta         numeric(15,2) NOT NULL DEFAULT 0,
  empresa_id   uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  UNIQUE (loja_id, periodo)
);

CREATE INDEX IF NOT EXISTS idx_metas_empresa ON public.metas(empresa_id);
CREATE INDEX IF NOT EXISTS idx_metas_loja    ON public.metas(loja_id);
CREATE INDEX IF NOT EXISTS idx_metas_periodo ON public.metas(periodo);

COMMENT ON TABLE public.metas IS 'Meta mensal por loja. Usada para calcular atingimento nos dashboards.';


-- ── Estoque ───────────────────────────────────────────────────
-- Snapshot de estoque por SKU. Recarregado via upload ou integração ERP.

CREATE TABLE IF NOT EXISTS public.estoque (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  sku_id          text NOT NULL,
  nome            text NOT NULL,
  grupo           text,
  genero          text,
  qtd_estoque     integer DEFAULT 0,
  faturamento     numeric(15,2) DEFAULT 0,  -- faturamento histórico do SKU
  data_entrada    date,                      -- data de entrada no estoque
  empresa_id      uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  importado_em    timestamptz DEFAULT now(),
  UNIQUE (sku_id, empresa_id)
);

CREATE INDEX IF NOT EXISTS idx_estoque_empresa ON public.estoque(empresa_id);
CREATE INDEX IF NOT EXISTS idx_estoque_grupo   ON public.estoque(grupo);
CREATE INDEX IF NOT EXISTS idx_estoque_nome    ON public.estoque USING gin(nome gin_trgm_ops);

COMMENT ON TABLE public.estoque IS 'Snapshot de estoque por SKU. Alimenta módulos curvaABC, cobertura, giro, envelhecimento.';


-- ── Usuário ↔ Empresa (permissões) ───────────────────────────
-- Relaciona usuários Supabase Auth com empresas e define seu role.

CREATE TABLE IF NOT EXISTS public.user_empresa (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      uuid NOT NULL,           -- ref: auth.users.id
  empresa_id   uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  role         text NOT NULL DEFAULT 'viewer'
                CHECK (role IN ('admin','manager','viewer')),
  franquias    text[] DEFAULT '{}',     -- [] = acesso a todas
  ativo        boolean DEFAULT true,
  criado_em    timestamptz DEFAULT now(),
  UNIQUE (user_id, empresa_id)
);

CREATE INDEX IF NOT EXISTS idx_user_empresa_user    ON public.user_empresa(user_id);
CREATE INDEX IF NOT EXISTS idx_user_empresa_empresa ON public.user_empresa(empresa_id);

COMMENT ON TABLE public.user_empresa
  IS 'Mapeamento usuário → empresa + role. Lido pelas RLS policies.';


-- ================================================================
-- ROW LEVEL SECURITY
-- ================================================================

ALTER TABLE public.franquias           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.faturamento_mensal  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.faturamento_franquia ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.metas               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.estoque             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_empresa        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.empresas            ENABLE ROW LEVEL SECURITY;


-- ================================================================
-- FUNÇÃO AUXILIAR — retorna empresa_id do usuário autenticado
-- ================================================================

CREATE OR REPLACE FUNCTION public.get_user_empresa_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT empresa_id
  FROM   public.user_empresa
  WHERE  user_id = auth.uid()
    AND  ativo   = true
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.get_user_empresa_id
  IS 'Retorna empresa_id do usuário atual. Usada nas RLS policies para isolar dados por empresa.';


-- ── FUNÇÃO AUXILIAR — array de franquias do usuário ──────────

CREATE OR REPLACE FUNCTION public.get_user_franquias()
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COALESCE(franquias, '{}')
  FROM   public.user_empresa
  WHERE  user_id = auth.uid()
    AND  ativo   = true
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.get_user_franquias
  IS 'Retorna array de franquias do usuário atual. [] = acesso a todas.';


-- ================================================================
-- RLS POLICIES
-- ================================================================

-- ── franquias ────────────────────────────────────────────────

CREATE POLICY "franquias: leitura por empresa"
ON public.franquias FOR SELECT
USING (
  empresa_id = public.get_user_empresa_id()
  AND (
    -- Acesso a todas as franquias (array vazio)
    array_length(public.get_user_franquias(), 1) IS NULL
    OR array_length(public.get_user_franquias(), 1) = 0
    -- Ou apenas às franquias do array do usuário
    OR id = ANY(public.get_user_franquias())
  )
);

CREATE POLICY "franquias: escrita apenas admin"
ON public.franquias FOR ALL
USING (
  empresa_id = public.get_user_empresa_id()
  AND EXISTS (
    SELECT 1 FROM public.user_empresa
    WHERE user_id = auth.uid() AND role = 'admin' AND ativo = true
  )
);


-- ── faturamento_mensal ────────────────────────────────────────

CREATE POLICY "faturamento_mensal: leitura por empresa"
ON public.faturamento_mensal FOR SELECT
USING (empresa_id = public.get_user_empresa_id());

CREATE POLICY "faturamento_mensal: escrita admin/manager"
ON public.faturamento_mensal FOR ALL
USING (
  empresa_id = public.get_user_empresa_id()
  AND EXISTS (
    SELECT 1 FROM public.user_empresa
    WHERE user_id = auth.uid() AND role IN ('admin','manager') AND ativo = true
  )
);


-- ── faturamento_franquia ──────────────────────────────────────

CREATE POLICY "fat_franquia: leitura por empresa e franquia"
ON public.faturamento_franquia FOR SELECT
USING (
  empresa_id = public.get_user_empresa_id()
  AND (
    array_length(public.get_user_franquias(), 1) IS NULL
    OR array_length(public.get_user_franquias(), 1) = 0
    OR franquia_id = ANY(public.get_user_franquias())
  )
);

CREATE POLICY "fat_franquia: escrita admin/manager"
ON public.faturamento_franquia FOR ALL
USING (
  empresa_id = public.get_user_empresa_id()
  AND EXISTS (
    SELECT 1 FROM public.user_empresa
    WHERE user_id = auth.uid() AND role IN ('admin','manager') AND ativo = true
  )
);


-- ── metas ─────────────────────────────────────────────────────

CREATE POLICY "metas: leitura por empresa e franquia"
ON public.metas FOR SELECT
USING (
  empresa_id = public.get_user_empresa_id()
  AND (
    array_length(public.get_user_franquias(), 1) IS NULL
    OR array_length(public.get_user_franquias(), 1) = 0
    OR loja_id = ANY(public.get_user_franquias())
  )
);

CREATE POLICY "metas: escrita admin/manager"
ON public.metas FOR ALL
USING (
  empresa_id = public.get_user_empresa_id()
  AND EXISTS (
    SELECT 1 FROM public.user_empresa
    WHERE user_id = auth.uid() AND role IN ('admin','manager') AND ativo = true
  )
);


-- ── estoque ───────────────────────────────────────────────────

CREATE POLICY "estoque: leitura por empresa"
ON public.estoque FOR SELECT
USING (empresa_id = public.get_user_empresa_id());

CREATE POLICY "estoque: escrita admin/manager"
ON public.estoque FOR ALL
USING (
  empresa_id = public.get_user_empresa_id()
  AND EXISTS (
    SELECT 1 FROM public.user_empresa
    WHERE user_id = auth.uid() AND role IN ('admin','manager') AND ativo = true
  )
);


-- ── user_empresa ──────────────────────────────────────────────

CREATE POLICY "user_empresa: leitura própria"
ON public.user_empresa FOR SELECT
USING (user_id = auth.uid());

-- Apenas service_role pode inserir/alterar permissões de usuários
-- (nunca pelo frontend — usar Supabase Dashboard ou Edge Functions)


-- ── empresas ──────────────────────────────────────────────────

CREATE POLICY "empresas: leitura pela própria empresa"
ON public.empresas FOR SELECT
USING (id = public.get_user_empresa_id());


-- ================================================================
-- TRIGGERS — atualizar atualizado_em automaticamente
-- ================================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.atualizado_em = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_franquias_updated
  BEFORE UPDATE ON public.franquias
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ================================================================
-- DADOS INICIAIS — empresa Osklen
-- ================================================================
-- Execute manualmente após o deploy para criar a empresa base.
-- Substitua os valores conforme necessário.

/*
INSERT INTO public.empresas (id, nome, slug)
VALUES ('00000000-0000-0000-0000-000000000001', 'Osklen', 'osklen')
ON CONFLICT (slug) DO NOTHING;

-- Após criar os usuários no Supabase Auth, vincule-os:
-- INSERT INTO public.user_empresa (user_id, empresa_id, role)
-- VALUES ('<uuid-do-usuario>', '00000000-0000-0000-0000-000000000001', 'admin');
*/
