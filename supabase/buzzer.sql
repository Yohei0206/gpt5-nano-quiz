-- Buzzer (fastest finger) match tables
create extension if not exists pgcrypto;

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  join_code text unique not null,
  state text not null check (state in ('waiting','in_progress','finished')) default 'waiting',
  category text not null,
  difficulty text not null,
  question_count int not null check (question_count between 1 and 50),
  current_index int not null default 0,
  locked_by uuid null,
  buzzed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_matches_code on public.matches (join_code);
create index if not exists idx_matches_state on public.matches (state);

create table if not exists public.match_players (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  name text not null,
  score int not null default 0,
  token text not null unique,
  is_host boolean not null default false,
  joined_at timestamptz not null default now()
);

create index if not exists idx_match_players_match on public.match_players (match_id);

create table if not exists public.match_questions (
  id bigint generated always as identity primary key,
  match_id uuid not null references public.matches(id) on delete cascade,
  question_id bigint not null references public.questions(id) on delete restrict,
  order_no int not null,
  unique(match_id, order_no)
);

create index if not exists idx_match_questions_match on public.match_questions (match_id);

create table if not exists public.match_events (
  id bigint generated always as identity primary key,
  match_id uuid not null references public.matches(id) on delete cascade,
  type text not null,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists idx_match_events_match on public.match_events (match_id);

-- RLS policies (read for all, writes via service role)
alter table public.matches enable row level security;
alter table public.match_players enable row level security;
alter table public.match_questions enable row level security;
alter table public.match_events enable row level security;

do $$ begin
  create policy "matches_read_all" on public.matches for select using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "match_players_read_all" on public.match_players for select using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "match_questions_read_all" on public.match_questions for select using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "match_events_read_all" on public.match_events for select using (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "matches_write_service" on public.matches for all to service_role using (true) with check (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "match_players_write_service" on public.match_players for all to service_role using (true) with check (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "match_questions_write_service" on public.match_questions for all to service_role using (true) with check (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "match_events_write_service" on public.match_events for all to service_role using (true) with check (true);
exception when duplicate_object then null; end $$;

