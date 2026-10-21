const { createClient } = supabase;
const sb = createClient(APP_CONFIG.SUPABASE_URL, APP_CONFIG.SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

const App = {
  async session() {
    const { data: { session } } = await sb.auth.getSession();
    return session;
  },
  async profile() {
    const session = await this.session();
    if (!session) return null;
    const { data, error } = await sb.from('profiles').select('role,section_id').eq('user_id', session.user.id).single();
    if (error) throw error;
    return { ...data, user: session.user };
  },
  async requireRole(role) {
    const p = await this.profile();
    if (!p) { location.href = 'index.html'; throw new Error('Nao autenticado'); }
    if (p.role !== role) { location.href = p.role === 'admin' ? 'admin.html' : 'secao.html'; throw new Error('Acesso negado'); }
    return p;
  },
  async logout() { await sb.auth.signOut(); location.href = 'index.html'; },
  flash(el, text, type='ok') { el.textContent = text; el.className = 'msg ' + type; }
};
