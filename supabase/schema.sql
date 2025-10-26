-- Questions table
create table if not exists public.questions (
  id bigint generated always as identity primary key,
  prompt text not null,
  choices jsonb not null,
  answer_index int not null check (answer_index between 0 and 3),
  explanation text,
  category text not null,
  subgenre text,
  difficulty text not null check (difficulty in ('easy','normal','hard')),
  source text not null default 'db',
  hash text,
  verified boolean not null default false,
  verified_at timestamptz,
  verify_notes text,
  source_url text,
  created_at timestamptz not null default now()
);

create index if not exists idx_questions_category on public.questions (category);
create index if not exists idx_questions_difficulty on public.questions (difficulty);
-- Ensure 'hash' column exists for existing installations
alter table public.questions add column if not exists hash text;
create unique index if not exists uq_questions_hash on public.questions (hash) where hash is not null;

-- Optional: RLS
alter table public.questions enable row level security;
do $$ begin
  create policy "questions_read_all" on public.questions
  for select using (true);
exception when duplicate_object then null; end $$;

-- For admin writes (use service role)
do $$ begin
  create policy "questions_write_service" on public.questions
  for all to service_role using (true) with check (true);
exception when duplicate_object then null; end $$;

-- ==========================================================
-- Master tables: categories, difficulties
-- ==========================================================

-- Categories master
create table if not exists public.categories (
  slug text primary key,
  label text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_categories_label on public.categories (label);

alter table public.categories enable row level security;
do $$ begin
  create policy "categories_read_all" on public.categories
  for select using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "categories_write_service" on public.categories
  for all to service_role using (true) with check (true);
exception when duplicate_object then null; end $$;

-- Difficulties master
create table if not exists public.difficulties (
  key text primary key,
  order_no int not null default 0,
  label text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_difficulties_order on public.difficulties (order_no);

alter table public.difficulties enable row level security;
do $$ begin
  create policy "difficulties_read_all" on public.difficulties
  for select using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "difficulties_write_service" on public.difficulties
  for all to service_role using (true) with check (true);
exception when duplicate_object then null; end $$;

-- Seed difficulties (idempotent)
insert into public.difficulties (key, order_no, label)
values
  ('easy', 1, 'easy'),
  ('normal', 2, 'normal'),
  ('hard', 3, 'hard')
on conflict (key) do nothing;

-- Optional seed categories (edit as needed)
insert into public.categories (slug, label) values
  ('general','一般教養'),
  ('science','理系・科学'),
  ('entertainment','文化・エンタメ'),
  ('otaku','アニメ・ゲーム・漫画'),
  ('trivia','雑学'),
  ('japan','日本'),
  ('world','世界'),
  ('society','時事・社会')
on conflict (slug) do nothing;

-- Optionally add NOT VALID foreign keys from questions to masters
-- After ensuring data consistency, you may VALIDATE the constraints.
do $$ begin
  alter table public.questions
    add constraint questions_category_fk
    foreign key (category) references public.categories(slug)
    not valid;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.questions
    add constraint questions_difficulty_fk
    foreign key (difficulty) references public.difficulties(key)
    not valid;
exception when duplicate_object then null; end $$;

-- To validate later (run manually in SQL editor once data is clean):
-- alter table public.questions validate constraint questions_category_fk;
-- alter table public.questions validate constraint questions_difficulty_fk;

-- Auto-hash trigger (INSERT/UPDATE) for questions.hash
create or replace function public.compute_question_hash() returns trigger language plpgsql as $$
declare
  c0 text; c1 text; c2 text; c3 text;
  canon_prompt text;
  canon_choices text;
begin
  if TG_OP = 'INSERT' or NEW.hash is null or (TG_OP = 'UPDATE' and (NEW.prompt is distinct from OLD.prompt or NEW.choices is distinct from OLD.choices)) then
    canon_prompt := lower(regexp_replace(coalesce(NEW.prompt,''), '\s+', ' ', 'g'));
    c0 := lower(regexp_replace(coalesce(NEW.choices->>0,''), '\s+', ' ', 'g'));
    c1 := lower(regexp_replace(coalesce(NEW.choices->>1,''), '\s+', ' ', 'g'));
    c2 := lower(regexp_replace(coalesce(NEW.choices->>2,''), '\s+', ' ', 'g'));
    c3 := lower(regexp_replace(coalesce(NEW.choices->>3,''), '\s+', ' ', 'g'));
    canon_choices := c0 || '||' || c1 || '||' || c2 || '||' || c3;
    NEW.hash := encode(digest(canon_prompt || '||' || canon_choices, 'sha256'), 'hex');
  end if;
  return NEW;
end $$;

drop trigger if exists trg_questions_set_hash on public.questions;
create trigger trg_questions_set_hash
before insert or update of prompt, choices on public.questions
for each row execute function public.compute_question_hash();
