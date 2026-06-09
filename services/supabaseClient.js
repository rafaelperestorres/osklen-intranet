/**
 * OSKLEN INTRANET — Supabase Client
 *
 * Singleton do cliente Supabase. Importado apenas por authService e dataService.
 * Nenhuma page, module ou component importa este arquivo diretamente.
 *
 * ── Configuração ──────────────────────────────────────────────
 * Defina as variáveis de ambiente no painel do Vercel:
 *
 *   VITE_SUPABASE_URL  = https://<seu-projeto>.supabase.co
 *   VITE_SUPABASE_ANON = eyJ...  (chave anon pública)
 *
 * Como não usamos bundler, as variáveis são lidas em runtime
 * via window.__SUPABASE_CONFIG injetado pelo _headers ou via
 * um endpoint edge do Vercel (veja /api/config.js).
 *
 * Para desenvolvimento local, crie um arquivo /config/env.js:
 *
 *   window.__SUPABASE_CONFIG = {
 *     url:  'https://xxxx.supabase.co',
 *     anon: 'eyJ...',
 *   };
 *
 * e inclua-o no index.html antes dos módulos (já incluído com
 * verificação de existência).
 *
 * ── Row Level Security ─────────────────────────────────────────
 * Todas as tabelas têm RLS habilitado. As policies estão em
 * /supabase/migrations/001_schema.sql.
 *
 * A chave anon só acessa o que as policies permitirem —
 * nunca exponha a service_role key no frontend.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

function getConfig() {
  // 1. Variável injetada por env.js (dev local)
  if (window.__SUPABASE_CONFIG?.url && window.__SUPABASE_CONFIG?.anon) {
    return window.__SUPABASE_CONFIG;
  }
  // 2. Meta tags (alternativa de deploy sem bundler)
  const urlMeta  = document.querySelector('meta[name="supabase-url"]')?.content;
  const anonMeta = document.querySelector('meta[name="supabase-anon"]')?.content;
  if (urlMeta && anonMeta) return { url: urlMeta, anon: anonMeta };

  throw new Error(
    '[SupabaseClient] Configuração não encontrada.\n' +
    'Crie /config/env.js com window.__SUPABASE_CONFIG = { url, anon } ' +
    'ou adicione meta tags supabase-url e supabase-anon no index.html.'
  );
}

let _client = null;

export function getSupabase() {
  if (_client) return _client;
  const { url, anon } = getConfig();
  _client = createClient(url, anon, {
    auth: {
      persistSession:    true,
      autoRefreshToken:  true,
      detectSessionInUrl:true,
    },
  });
  return _client;
}

export default getSupabase;
