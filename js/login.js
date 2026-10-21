document.addEventListener('DOMContentLoaded', async () => {
  const current = await App.profile().catch(()=>null);
  if (current) location.href = current.role === 'admin' ? 'admin.html' : 'secao.html';
  document.getElementById('login').onclick = async () => {
    const msg = document.getElementById('msg');
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    App.flash(msg,'Autenticando...','info');
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) return App.flash(msg,'Login invalido.','error');
    const p = await App.profile();
    location.href = p.role === 'admin' ? 'admin.html' : 'secao.html';
  };
});
