create extension if not exists pgcrypto;

create table if not exists public.elections (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'setup' check (status in ('setup','open','closed')),
  created_at timestamptz not null default now()
);
create table if not exists public.sections (
  id uuid primary key default gen_random_uuid(),
  election_id uuid not null references public.elections(id) on delete cascade,
  code text not null,
  name text not null,
  status text not null default 'ready' check (status in ('ready','open','closed')),
  unique(election_id,code)
);
create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check(role in ('admin','section')),
  section_id uuid references public.sections(id) on delete cascade
);
create table if not exists public.slates (
  id uuid primary key default gen_random_uuid(),
  election_id uuid not null references public.elections(id) on delete cascade,
  number text not null check(number ~ '^[0-9]{2}$'),
  name text not null,
  unique(election_id,number)
);
create table if not exists public.voters (
  id uuid primary key default gen_random_uuid(),
  election_id uuid not null references public.elections(id) on delete cascade,
  section_id uuid not null references public.sections(id) on delete cascade,
  ra text not null,
  name text not null,
  has_voted boolean not null default false,
  unique(election_id,ra)
);
create table if not exists public.ballot_sessions (
  id uuid primary key default gen_random_uuid(),
  election_id uuid not null references public.elections(id) on delete cascade,
  section_id uuid not null references public.sections(id) on delete cascade,
  voter_id uuid not null references public.voters(id) on delete cascade,
  token uuid not null default gen_random_uuid() unique,
  consumed boolean not null default false,
  created_at timestamptz not null default now()
);
create table if not exists public.votes (
  id uuid primary key default gen_random_uuid(),
  election_id uuid not null references public.elections(id) on delete cascade,
  section_id uuid not null references public.sections(id) on delete cascade,
  choice text not null,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin() returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from public.profiles p where p.user_id=auth.uid() and p.role='admin') $$;
create or replace function public.my_section_id() returns uuid language sql stable security definer set search_path=public as $$ select section_id from public.profiles where user_id=auth.uid() and role='section' $$;

alter table public.elections enable row level security;
alter table public.sections enable row level security;
alter table public.profiles enable row level security;
alter table public.slates enable row level security;
alter table public.voters enable row level security;
alter table public.ballot_sessions enable row level security;
alter table public.votes enable row level security;

create policy "profiles self" on public.profiles for select to authenticated using(user_id=auth.uid());
create policy "admin elections all" on public.elections for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy "section election read" on public.elections for select to authenticated using(public.is_admin() or exists(select 1 from public.sections s where s.election_id=elections.id and s.id=public.my_section_id()));
create policy "admin sections all" on public.sections for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy "section own section" on public.sections for select to authenticated using(public.is_admin() or id=public.my_section_id());
create policy "section own status" on public.sections for update to authenticated using(id=public.my_section_id()) with check(id=public.my_section_id());
create policy "admin slates all" on public.slates for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy "slates read authenticated" on public.slates for select to authenticated using(true);
create policy "admin voters all" on public.voters for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy "section voters read" on public.voters for select to authenticated using(section_id=public.my_section_id());

revoke all on public.votes from anon, authenticated;
revoke all on public.ballot_sessions from anon, authenticated;
grant select,insert,update,delete on public.elections, public.sections, public.slates, public.voters, public.profiles to authenticated;

create or replace function public.create_ballot_session(p_voter_id uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare v_voter public.voters; v_e public.elections; v_sec public.sections; v_token uuid;
begin
 select * into v_voter from public.voters where id=p_voter_id for update;
 if v_voter.id is null or v_voter.section_id<>public.my_section_id() then raise exception 'Eleitor invalido para esta secao'; end if;
 if v_voter.has_voted then raise exception 'Eleitor ja votou'; end if;
 select * into v_e from public.elections where id=v_voter.election_id;
 select * into v_sec from public.sections where id=v_voter.section_id;
 if v_e.status<>'open' or v_sec.status='closed' then raise exception 'Votacao nao esta aberta'; end if;
 if exists(select 1 from public.ballot_sessions where voter_id=p_voter_id and consumed=false) then raise exception 'Eleitor ja possui urna liberada'; end if;
 insert into public.ballot_sessions(election_id,section_id,voter_id) values(v_voter.election_id,v_voter.section_id,v_voter.id) returning token into v_token;
 return v_token;
end $$;

create or replace function public.cast_vote(p_session_token uuid,p_choice text) returns void language plpgsql security definer set search_path=public as $$
declare s public.ballot_sessions; e public.elections; valid_choice boolean;
begin
 select * into s from public.ballot_sessions where token=p_session_token for update;
 if s.id is null or s.consumed then raise exception 'Sessao de voto invalida'; end if;
 if s.section_id<>public.my_section_id() then raise exception 'Sessao pertence a outra secao'; end if;
 select * into e from public.elections where id=s.election_id;
 if e.status<>'open' then raise exception 'Eleicao encerrada'; end if;
 if exists(select 1 from public.voters where id=s.voter_id and has_voted) then raise exception 'Eleitor ja votou'; end if;
 valid_choice := p_choice in ('BRANCO','NULO') or exists(select 1 from public.slates where election_id=s.election_id and number=p_choice);
 if not valid_choice then raise exception 'Escolha invalida'; end if;
 insert into public.votes(election_id,section_id,choice) values(s.election_id,s.section_id,p_choice);
 update public.voters set has_voted=true where id=s.voter_id;
 update public.ballot_sessions set consumed=true where id=s.id;
end $$;

grant execute on function public.create_ballot_session(uuid) to authenticated;
grant execute on function public.cast_vote(uuid,text) to authenticated;

create or replace function public.section_stats(p_section_id uuid) returns table(registered bigint,voted bigint) language sql stable security definer set search_path=public as $$
 select count(*), count(*) filter(where has_voted) from public.voters where section_id=p_section_id and (public.is_admin() or p_section_id=public.my_section_id())
$$;
grant execute on function public.section_stats(uuid) to authenticated;

create or replace function public.admin_section_stats(p_election_id uuid) returns table(code text,status text,registered bigint,voted bigint) language sql stable security definer set search_path=public as $$
 select s.code,s.status,count(v.id),count(v.id) filter(where v.has_voted) from public.sections s left join public.voters v on v.section_id=s.id where s.election_id=p_election_id and public.is_admin() group by s.id,s.code,s.status order by s.code
$$;
grant execute on function public.admin_section_stats(uuid) to authenticated;

create or replace function public.totalize_election(p_election_id uuid) returns table(kind text,label text,votes bigint) language plpgsql security definer set search_path=public as $$
begin
 if not public.is_admin() then raise exception 'Acesso negado'; end if;
 if not exists(select 1 from public.elections where id=p_election_id and status='closed') then raise exception 'Eleicao ainda nao encerrada'; end if;
 return query select 'slate', s.number||' - '||s.name, count(v.id) from public.slates s left join public.votes v on v.election_id=s.election_id and v.choice=s.number where s.election_id=p_election_id group by s.id,s.number,s.name
 union all select 'blank','BRANCOS',count(*) from public.votes where election_id=p_election_id and choice='BRANCO'
 union all select 'null','NULOS',count(*) from public.votes where election_id=p_election_id and choice='NULO';
end $$;
grant execute on function public.totalize_election(uuid) to authenticated;
