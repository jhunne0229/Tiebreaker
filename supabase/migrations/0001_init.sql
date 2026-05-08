-- 타이브레이커 초기 스키마
-- 실행: Supabase 대시보드 → SQL Editor → 새 쿼리 → 이 파일 전체 붙여넣고 실행

-- ─── ENUMS ───────────────────────────────────────────────
create type decision_type as enum ('daily', 'career', 'purchase', 'relationship', 'other');
create type decision_tone as enum ('logical', 'emotional', 'blunt');
create type decision_status as enum ('open', 'decided');
create type pros_con_kind as enum ('pro', 'con');
create type swot_quadrant as enum ('S', 'W', 'O', 'T');

-- ─── PROFILES ────────────────────────────────────────────
-- auth.users를 그대로 노출하지 않기 위해 표시용 프로필을 별도 테이블로
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  name text,
  avatar_url text,
  created_at timestamptz not null default now()
);

-- auth.users 생성 시 자동으로 profile 생성
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─── DECISIONS ───────────────────────────────────────────
create table public.decisions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  context text,
  type decision_type not null default 'other',
  tone decision_tone not null default 'logical',
  status decision_status not null default 'open',
  final_choice_id uuid,
  final_note text,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

create index decisions_user_id_created_at_idx on public.decisions (user_id, created_at desc);
create index decisions_user_id_title_idx on public.decisions (user_id, title);

-- ─── OPTIONS ─────────────────────────────────────────────
create table public.options (
  id uuid primary key default gen_random_uuid(),
  decision_id uuid not null references public.decisions(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 200),
  description text,
  position int not null default 0,
  created_at timestamptz not null default now()
);

create index options_decision_id_idx on public.options (decision_id, position);

-- final_choice_id FK 추가 (options 생성 후)
alter table public.decisions
  add constraint decisions_final_choice_fk foreign key (final_choice_id)
  references public.options(id) on delete set null;

-- ─── CRITERIA ────────────────────────────────────────────
create table public.criteria (
  id uuid primary key default gen_random_uuid(),
  decision_id uuid not null references public.decisions(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  weight smallint not null default 3 check (weight between 1 and 5),
  position int not null default 0,
  created_at timestamptz not null default now()
);

create index criteria_decision_id_idx on public.criteria (decision_id, position);

-- ─── SCORES ──────────────────────────────────────────────
create table public.scores (
  id uuid primary key default gen_random_uuid(),
  option_id uuid not null references public.options(id) on delete cascade,
  criteria_id uuid not null references public.criteria(id) on delete cascade,
  value smallint not null check (value between 1 and 10),
  reasoning text,
  ai_generated boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (option_id, criteria_id)
);

create index scores_option_id_idx on public.scores (option_id);
create index scores_criteria_id_idx on public.scores (criteria_id);

-- ─── PROS / CONS ─────────────────────────────────────────
create table public.pros_cons_items (
  id uuid primary key default gen_random_uuid(),
  decision_id uuid not null references public.decisions(id) on delete cascade,
  option_id uuid references public.options(id) on delete cascade,
  kind pros_con_kind not null,
  text text not null check (char_length(text) between 1 and 500),
  ai_generated boolean not null default true,
  tone decision_tone not null default 'logical',
  created_at timestamptz not null default now()
);

create index pros_cons_decision_idx on public.pros_cons_items (decision_id, created_at desc);

-- ─── SWOT ────────────────────────────────────────────────
create table public.swot_items (
  id uuid primary key default gen_random_uuid(),
  decision_id uuid not null references public.decisions(id) on delete cascade,
  option_id uuid references public.options(id) on delete cascade,
  quadrant swot_quadrant not null,
  text text not null check (char_length(text) between 1 and 500),
  ai_generated boolean not null default true,
  tone decision_tone not null default 'logical',
  created_at timestamptz not null default now()
);

create index swot_decision_idx on public.swot_items (decision_id, created_at desc);

-- ─── ANALYSIS LOGS (일일 한도 카운트 + 캐시) ────────────
create table public.analysis_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  decision_id uuid not null references public.decisions(id) on delete cascade,
  tone decision_tone not null,
  -- input fingerprint: 동일 결정+톤+옵션/기준 셋업이면 캐시 hit (24h TTL)
  input_hash text not null,
  -- 결과를 그대로 저장하면 이전 결과를 재사용해 비용 절감
  result_json jsonb,
  status text not null default 'success' check (status in ('success', 'aborted', 'error')),
  error_message text,
  created_at timestamptz not null default now()
);

create index analysis_logs_user_created_idx on public.analysis_logs (user_id, created_at desc);
create index analysis_logs_cache_idx on public.analysis_logs (decision_id, tone, input_hash, created_at desc);

-- ─── 자동 updated_at (scores) ────────────────────────────
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger scores_touch_updated_at
  before update on public.scores
  for each row execute function public.touch_updated_at();
