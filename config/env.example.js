/**
 * OSKLEN INTRANET — Configuração de ambiente (desenvolvimento local)
 *
 * INSTRUÇÕES:
 *   1. Copie este arquivo para /config/env.js
 *   2. Preencha com suas credenciais do painel Supabase
 *   3. NUNCA faça commit do env.js — ele está no .gitignore
 *
 * Para encontrar esses valores:
 *   Supabase Dashboard → Settings → API
 *     Project URL  → campo "Project URL"
 *     Anon key     → campo "anon" (public)
 *
 * ⚠️  Use SEMPRE a chave "anon" — nunca a "service_role" no frontend.
 */

window.__SUPABASE_CONFIG = {
  url:  'https://SEU-PROJETO.supabase.co',
  anon: 'eyJ...',  // chave anon pública
};

/*
 * DEPLOY NO VERCEL:
 *   Não inclua este arquivo no repositório.
 *   Configure as variáveis no painel do Vercel:
 *     Settings → Environment Variables
 *
 *   Depois adicione uma Edge Function /api/config.js que retorna
 *   as variáveis de ambiente (sem expor a service_role):
 *
 *   export default function handler(req, res) {
 *     res.json({
 *       url:  process.env.SUPABASE_URL,
 *       anon: process.env.SUPABASE_ANON_KEY,
 *     });
 *   }
 *
 *   E no index.html, antes dos módulos:
 *   <script>
 *     (async () => {
 *       const cfg = await fetch('/api/config').then(r => r.json());
 *       window.__SUPABASE_CONFIG = cfg;
 *     })();
 *   </script>
 *
 * ALTERNATIVA MAIS SIMPLES (meta tags no index.html):
 *   Configure no Vercel e use um build step para injetar:
 *   <meta name="supabase-url"  content="${SUPABASE_URL}">
 *   <meta name="supabase-anon" content="${SUPABASE_ANON_KEY}">
 */
