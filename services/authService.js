/**
 * OSKLEN INTRANET — AuthService (Supabase Auth)
 *
 * Interface pública idêntica à versão mock da Fase 1/2.
 * Nenhuma outra camada (pages, components, store) precisou mudar.
 *
 * Fluxo de autenticação:
 *   login()      → supabase.auth.signInWithPassword()
 *   logout()     → supabase.auth.signOut()
 *   getSession() → supabase.auth.getSession()
 *
 * Controle de acesso por role (user_metadata.role):
 *   'admin'   — acesso total
 *   'manager' — acesso à maioria dos dashboards
 *   'viewer'  — somente leitura
 *
 * Multiempresa (user_metadata.empresa_id):
 *   Cada usuário pertence a uma empresa. As RLS policies do Supabase
 *   filtram automaticamente os dados por empresa_id.
 *
 * Restrição por franquia (user_metadata.franquias: string[]):
 *   [] = acesso a todas. Qualquer array não-vazio limita o acesso.
 *
 * Fallback local:
 *   Se Supabase não estiver configurado (env.js ausente), o serviço
 *   usa autenticação local com config/users.js — útil para dev offline.
 */

import eventBus from '../store/eventBus.js';

const SESSION_KEY = 'osklen_session';

class AuthService {
  constructor() {
    this._session  = null;
    this._supabase = null;
    this._mode     = 'local';
    this._ready    = this._init();
  }

  async _init() {
    try {
      const { getSupabase } = await import('./supabaseClient.js');
      this._supabase = getSupabase();
      this._mode     = 'supabase';

      const { data } = await this._supabase.auth.getSession();
      if (data?.session) {
        this._session = this._fromSupabase(data.session);
        this._persist();
      }

      this._supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          this._session = session ? this._fromSupabase(session) : null;
          this._persist();
        }
        if (event === 'SIGNED_OUT') {
          this._session = null;
          sessionStorage.removeItem(SESSION_KEY);
          eventBus.emit('auth:logout');
        }
      });

      console.info('[AuthService] Modo: Supabase');
    } catch (_) {
      this._mode = 'local';
      this._loadLocal();
      console.info('[AuthService] Modo: local (fallback)');
    }
  }

  /** Aguarda inicialização antes de operar. Útil no boot() do index.html. */
  async ready() { return this._ready; }

  async login(identifier, password) {
    await this._ready;
    if (this._mode === 'supabase') return this._loginSupabase(identifier, password);
    return this._loginLocal(identifier, password);
  }

  async logout() {
    if (this._mode === 'supabase' && this._supabase) {
      await this._supabase.auth.signOut().catch(() => {});
    }
    this._session = null;
    sessionStorage.removeItem(SESSION_KEY);
    eventBus.emit('auth:logout');
  }

  getSession() { return this._session ? { ...this._session } : null; }

  isAuthenticated() { return this._session !== null; }

  hasRole(required) {
    const h = { admin: 3, manager: 2, viewer: 1 };
    return (h[this._session?.role] ?? 0) >= (h[required] ?? 0);
  }

  async _loginSupabase(email, password) {
    try {
      const { data, error } = await this._supabase.auth.signInWithPassword({
        email: email.trim(), password: password.trim(),
      });
      if (error) return { ok: false, error: _mapError(error) };
      this._session = this._fromSupabase(data.session);
      this._persist();
      eventBus.emit('auth:login', this._session);
      return { ok: true, user: this._session };
    } catch (_) {
      return { ok: false, error: 'Erro de conexão. Verifique sua internet.' };
    }
  }

  _fromSupabase(session) {
    const meta  = session.user?.user_metadata ?? {};
    const email = session.user?.email ?? '';
    const name  = meta.name ?? meta.full_name ?? email.split('@')[0];
    return {
      user:       name,
      email,
      role:       meta.role       ?? 'viewer',
      initials:   _initials(name),
      empresa_id: meta.empresa_id ?? null,
      franquias:  meta.franquias  ?? [],
      supabaseId: session.user?.id,
    };
  }

  async _loginLocal(username, password) {
    try {
      const { USERS } = await import('../config/users.js');
      const match = USERS.find(
        u => u.user.toLowerCase() === username.toLowerCase().trim()
          && u.pass === password.trim()
      );
      if (!match) return { ok: false, error: 'Usuário ou senha incorretos.' };
      this._session = {
        user: match.user, email: match.user,
        role: match.role ?? 'viewer', initials: _initials(match.user),
        empresa_id: null, franquias: [],
      };
      this._persist();
      eventBus.emit('auth:login', this._session);
      return { ok: true, user: this._session };
    } catch (_) {
      return { ok: false, error: 'Erro interno.' };
    }
  }

  _persist() {
    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(this._session)); } catch(_) {}
  }
  _loadLocal() {
    try { const r = sessionStorage.getItem(SESSION_KEY); if (r) this._session = JSON.parse(r); }
    catch(_) { this._session = null; }
  }
}

function _initials(name = '') {
  return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
}
function _mapError(err) {
  const map = {
    'Invalid login credentials': 'Usuário ou senha incorretos.',
    'Email not confirmed':       'E-mail não confirmado. Verifique sua caixa de entrada.',
    'Too many requests':         'Muitas tentativas. Aguarde alguns minutos.',
  };
  return map[err.message] ?? err.message ?? 'Erro de autenticação.';
}

const authService = new AuthService();
export default authService;
