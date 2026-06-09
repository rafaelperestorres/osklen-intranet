/**
 * OSKLEN INTRANET — Usuários
 *
 * Lista temporária de usuários hardcoded.
 * Será substituída integralmente pelo Supabase Auth.
 * Ao migrar: remova este arquivo e atualize authService.js.
 *
 * Campos futuros (Supabase):
 *   role       — 'admin' | 'manager' | 'viewer'
 *   empresa_id — para suporte multiempresa
 *   franquias  — array de IDs com acesso (Row Level Security)
 */
export const USERS = [
  { user: 'Rodrigo Murito',  pass: 'Osklen', role: 'admin' },
  { user: 'Rodrigo Palma',   pass: 'Osklen', role: 'admin' },
  { user: 'Alan',            pass: 'Osklen', role: 'manager' },
  { user: 'Rafael',          pass: 'Osklen', role: 'manager' },
  { user: 'Joao',            pass: 'Osklen', role: 'viewer' },
  { user: 'Saulo',           pass: 'Osklen', role: 'viewer' },
  { user: 'Christian',       pass: 'Osklen', role: 'viewer' },
];
