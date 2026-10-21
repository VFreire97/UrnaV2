URNA GREMIO V2 - GitHub Pages + Supabase

1. Crie um projeto Supabase.
2. Abra SQL Editor e execute supabase/schema.sql.
3. Em Authentication > Users, crie as contas do administrador e de cada secao.
4. Depois de criar cada usuario, obtenha o UUID e execute no SQL Editor, por exemplo:
   insert into public.profiles(user_id, role, section_id) values ('UUID_ADMIN','admin',null);
   insert into public.profiles(user_id, role, section_id) values ('UUID_SECAO_1','section','UUID_DA_SECAO');
5. Edite js/config.js com SUPABASE_URL e SUPABASE_PUBLISHABLE_KEY.
6. Publique o conteudo desta pasta no GitHub Pages.
7. Login administrativo: conta Supabase com profiles.role='admin'.
8. Login de secao: conta Supabase com profiles.role='section' e section_id definido.

Planilha de eleitores: colunas RA, NOME, SECAO. O valor SECAO deve coincidir com o codigo da secao cadastrado no painel admin.

IMPORTANTE: nao coloque service_role key no GitHub. Use apenas a Publishable/Anon key no frontend; RLS e funcoes SQL protegem as operacoes.
