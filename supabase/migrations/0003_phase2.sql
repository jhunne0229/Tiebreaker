-- 타이브레이커 Phase 2 스키마
-- 신규 테이블: reviews, cartesian_items, drucker_answers, user_tendencies, recommendation_scores, criteria_templates
-- 기존 수정: decisions(+share_token, +share_og_enabled, +divergence_cache), options(+ai_labels), profiles(+notification_channel, +notification_channel_locked)
-- 트리거: 신규 profile → user_tendencies row 자동 생성
-- 뷰: decision_share_view (익명 share-token 페이지용 컬럼 필터)
-- 시드: criteria_templates 시스템 기본 4종
-- 실행: Supabase 대시보드 → SQL Editor → 새 쿼리 → 이 파일 전체 붙여넣고 실행

-- ─── ENUMS ───────────────────────────────────────────────
create type review_trigger as enum ('week_1', 'month_1', 'manual');
create type cartesian_quadrant as enum ('Q1', 'Q2', 'Q3', 'Q4');
create type drucker_question as enum ('mission', 'customer', 'customer_value', 'result', 'plan');
create type score_mode as enum ('logical', 'emotional');
create type score_tier as enum ('top', 'bottom', 'middle', 'close');
create type confidence_label as enum ('onboarding', 'learning', 'personalized');
create type notification_channel as enum ('email', 'push', 'both', 'off');

-- ─── DECISIONS 확장 ──────────────────────────────────────
alter table public.decisions
  add column if not exists share_token uuid,
  add column if not exists share_og_enabled boolean not null default true,
  add column if not exists divergence_cache jsonb;

-- share_token 충돌 방지 + 부분 unique (null 다수 허용)
create unique index if not exists decisions_share_token_uidx
  on public.decisions (share_token)
  where share_token is not null;

-- ─── OPTIONS 확장 ────────────────────────────────────────
alter table public.options
  add column if not exists ai_labels jsonb;

-- ─── PROFILES 확장 ───────────────────────────────────────
alter table public.profiles
  add column if not exists notification_channel notification_channel not null default 'email',
  add column if not exists notification_channel_locked boolean not null default false;

-- ─── REVIEWS (회고) ──────────────────────────────────────
create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  decision_id uuid not null references public.decisions(id) on delete cascade,
  reviewed_at timestamptz not null default now(),
  rating smallint not null check (rating between 1 and 5),
  reflection text check (reflection is null or char_length(reflection) <= 2000),
  trigger review_trigger not null default 'manual',
  created_at timestamptz not null default now()
);

create index if not exists reviews_decision_idx on public.reviews (decision_id, reviewed_at desc);

-- ─── CARTESIAN ITEMS (4분면) ─────────────────────────────
create table if not exists public.cartesian_items (
  id uuid primary key default gen_random_uuid(),
  decision_id uuid not null references public.decisions(id) on delete cascade,
  option_id uuid references public.options(id) on delete cascade,
  quadrant cartesian_quadrant not null,
  keyword text not null check (char_length(keyword) between 1 and 100),
  description text check (description is null or char_length(description) <= 500),
  ai_generated boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists cartesian_decision_quadrant_idx on public.cartesian_items (decision_id, quadrant);
create index if not exists cartesian_option_idx on public.cartesian_items (option_id);

-- ─── DRUCKER ANSWERS (5질문) ─────────────────────────────
-- 결정당 질문별 1행 (UPSERT)
create table if not exists public.drucker_answers (
  id uuid primary key default gen_random_uuid(),
  decision_id uuid not null references public.decisions(id) on delete cascade,
  question drucker_question not null,
  ai_draft text,
  user_answer text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (decision_id, question)
);

create index if not exists drucker_decision_idx on public.drucker_answers (decision_id);

create trigger drucker_answers_touch_updated_at
  before update on public.drucker_answers
  for each row execute function public.touch_updated_at();

-- ─── USER TENDENCIES (사용자 경향성) ─────────────────────
-- 5개 현재값 + 5개 온보딩 자가평가값 + onboarding_completed_at + satisfaction_bias + counts
create table if not exists public.user_tendencies (
  user_id uuid primary key references auth.users(id) on delete cascade,
  -- 현재값 (EWMA 갱신)
  risk_tolerance real not null default 0 check (risk_tolerance between -1 and 1),
  time_orientation real not null default 0 check (time_orientation between -1 and 1),
  change_openness real not null default 0 check (change_openness between -1 and 1),
  analytical_intuitive real not null default 0 check (analytical_intuitive between -1 and 1),
  self_others real not null default 0 check (self_others between -1 and 1),
  -- 온보딩 자가 평가값 (레이더 비교/리셋용 영구 보존)
  onboarding_risk_tolerance real check (onboarding_risk_tolerance is null or onboarding_risk_tolerance between -1 and 1),
  onboarding_time_orientation real check (onboarding_time_orientation is null or onboarding_time_orientation between -1 and 1),
  onboarding_change_openness real check (onboarding_change_openness is null or onboarding_change_openness between -1 and 1),
  onboarding_analytical_intuitive real check (onboarding_analytical_intuitive is null or onboarding_analytical_intuitive between -1 and 1),
  onboarding_self_others real check (onboarding_self_others is null or onboarding_self_others between -1 and 1),
  onboarding_completed_at timestamptz,
  -- 만족 보정값 (Phase 2는 저장만, 가중치 반영은 Phase 3)
  satisfaction_bias real not null default 3.0 check (satisfaction_bias between 0 and 5),
  -- 임계치 판정용 카운트
  decision_count integer not null default 0 check (decision_count >= 0),
  review_count integer not null default 0 check (review_count >= 0),
  updated_at timestamptz not null default now()
);

create trigger user_tendencies_touch_updated_at
  before update on public.user_tendencies
  for each row execute function public.touch_updated_at();

-- 신규 profile 생성 시 user_tendencies row 자동 생성
create or replace function public.handle_new_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_tendencies (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_profile_created on public.profiles;
create trigger on_profile_created
  after insert on public.profiles
  for each row execute function public.handle_new_profile();

-- 기존 사용자 백필 (Phase 1에 가입한 유저들)
insert into public.user_tendencies (user_id)
select id from public.profiles
on conflict (user_id) do nothing;

-- ─── RECOMMENDATION SCORES (옵션별 점수 캐시) ────────────
create table if not exists public.recommendation_scores (
  id uuid primary key default gen_random_uuid(),
  option_id uuid not null references public.options(id) on delete cascade,
  mode score_mode not null,
  score smallint not null check (score between 0 and 100),
  tier score_tier not null,
  reasoning jsonb,
  confidence_label confidence_label not null,
  computed_at timestamptz not null default now(),
  unique (option_id, mode)
);

create index if not exists recommendation_scores_option_idx on public.recommendation_scores (option_id);

-- ─── CRITERIA TEMPLATES (기준 템플릿) ────────────────────
-- user_id null + is_system=true → 시스템 기본 (모든 사용자 읽기 가능)
create table if not exists public.criteria_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  criteria jsonb not null,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  -- 시스템 템플릿이면 user_id null, 사용자 템플릿이면 user_id not null
  check ((is_system = true and user_id is null) or (is_system = false and user_id is not null))
);

create index if not exists criteria_templates_user_idx on public.criteria_templates (user_id) where user_id is not null;
create index if not exists criteria_templates_system_idx on public.criteria_templates (is_system) where is_system = true;

-- 시스템 기본 템플릿 4종 시드 (06_PHASE2_PRD.md §2.7)
insert into public.criteria_templates (user_id, name, criteria, is_system)
values
  (
    null,
    '커리어 방향 기준 세트',
    '[
      {"name": "연봉", "weight": 5},
      {"name": "성장 가능성", "weight": 5},
      {"name": "직무 적합도", "weight": 5},
      {"name": "조직 문화", "weight": 4},
      {"name": "워라밸", "weight": 4},
      {"name": "리스크", "weight": 4}
    ]'::jsonb,
    true
  ),
  (
    null,
    '구매 기준 세트',
    '[
      {"name": "가격", "weight": 5},
      {"name": "품질/내구성", "weight": 5},
      {"name": "사용 빈도", "weight": 4},
      {"name": "디자인", "weight": 3},
      {"name": "A/S 편의성", "weight": 3}
    ]'::jsonb,
    true
  ),
  (
    null,
    '관계 기준 세트',
    '[
      {"name": "가치관", "weight": 5},
      {"name": "소통 방식", "weight": 5},
      {"name": "미래 방향성", "weight": 5},
      {"name": "생활 습관", "weight": 4},
      {"name": "가족 관계", "weight": 3}
    ]'::jsonb,
    true
  ),
  (
    null,
    '일상 기준 세트',
    '[
      {"name": "기분/만족도", "weight": 5},
      {"name": "소요 시간", "weight": 4},
      {"name": "편의성", "weight": 4},
      {"name": "비용", "weight": 3},
      {"name": "건강 영향", "weight": 3}
    ]'::jsonb,
    true
  )
on conflict do nothing;

-- ─── DECISION SHARE VIEW (익명 공유 페이지용) ────────────
-- 회고/경향성/내부 캐시 컬럼은 노출하지 않는다.
-- security_invoker 미설정 → 뷰 소유자(postgres) 권한으로 실행되어 RLS 우회.
-- 의도된 동작: share_token이 not null인 결정만 익명에게 보이게 한다.
create or replace view public.decision_share_view as
select
  id,
  user_id,
  title,
  context,
  type,
  status,
  final_choice_id,
  share_token,
  share_og_enabled,
  created_at,
  decided_at
from public.decisions
where share_token is not null;

grant select on public.decision_share_view to anon, authenticated;

-- ─── RLS: 신규 테이블 ────────────────────────────────────
-- reviews (decision의 소유자만 접근)
alter table public.reviews enable row level security;

drop policy if exists "reviews_select_via_decision" on public.reviews;
create policy "reviews_select_via_decision"
  on public.reviews for select
  using (exists (select 1 from public.decisions d where d.id = reviews.decision_id and d.user_id = auth.uid()));

drop policy if exists "reviews_insert_via_decision" on public.reviews;
create policy "reviews_insert_via_decision"
  on public.reviews for insert
  with check (exists (select 1 from public.decisions d where d.id = reviews.decision_id and d.user_id = auth.uid()));

drop policy if exists "reviews_update_via_decision" on public.reviews;
create policy "reviews_update_via_decision"
  on public.reviews for update
  using (exists (select 1 from public.decisions d where d.id = reviews.decision_id and d.user_id = auth.uid()))
  with check (exists (select 1 from public.decisions d where d.id = reviews.decision_id and d.user_id = auth.uid()));

drop policy if exists "reviews_delete_via_decision" on public.reviews;
create policy "reviews_delete_via_decision"
  on public.reviews for delete
  using (exists (select 1 from public.decisions d where d.id = reviews.decision_id and d.user_id = auth.uid()));

-- cartesian_items
alter table public.cartesian_items enable row level security;

drop policy if exists "cartesian_select_via_decision" on public.cartesian_items;
create policy "cartesian_select_via_decision"
  on public.cartesian_items for select
  using (exists (select 1 from public.decisions d where d.id = cartesian_items.decision_id and d.user_id = auth.uid()));

drop policy if exists "cartesian_insert_via_decision" on public.cartesian_items;
create policy "cartesian_insert_via_decision"
  on public.cartesian_items for insert
  with check (exists (select 1 from public.decisions d where d.id = cartesian_items.decision_id and d.user_id = auth.uid()));

drop policy if exists "cartesian_update_via_decision" on public.cartesian_items;
create policy "cartesian_update_via_decision"
  on public.cartesian_items for update
  using (exists (select 1 from public.decisions d where d.id = cartesian_items.decision_id and d.user_id = auth.uid()))
  with check (exists (select 1 from public.decisions d where d.id = cartesian_items.decision_id and d.user_id = auth.uid()));

drop policy if exists "cartesian_delete_via_decision" on public.cartesian_items;
create policy "cartesian_delete_via_decision"
  on public.cartesian_items for delete
  using (exists (select 1 from public.decisions d where d.id = cartesian_items.decision_id and d.user_id = auth.uid()));

-- drucker_answers
alter table public.drucker_answers enable row level security;

drop policy if exists "drucker_select_via_decision" on public.drucker_answers;
create policy "drucker_select_via_decision"
  on public.drucker_answers for select
  using (exists (select 1 from public.decisions d where d.id = drucker_answers.decision_id and d.user_id = auth.uid()));

drop policy if exists "drucker_insert_via_decision" on public.drucker_answers;
create policy "drucker_insert_via_decision"
  on public.drucker_answers for insert
  with check (exists (select 1 from public.decisions d where d.id = drucker_answers.decision_id and d.user_id = auth.uid()));

drop policy if exists "drucker_update_via_decision" on public.drucker_answers;
create policy "drucker_update_via_decision"
  on public.drucker_answers for update
  using (exists (select 1 from public.decisions d where d.id = drucker_answers.decision_id and d.user_id = auth.uid()))
  with check (exists (select 1 from public.decisions d where d.id = drucker_answers.decision_id and d.user_id = auth.uid()));

drop policy if exists "drucker_delete_via_decision" on public.drucker_answers;
create policy "drucker_delete_via_decision"
  on public.drucker_answers for delete
  using (exists (select 1 from public.decisions d where d.id = drucker_answers.decision_id and d.user_id = auth.uid()));

-- user_tendencies
alter table public.user_tendencies enable row level security;

drop policy if exists "user_tendencies_select_own" on public.user_tendencies;
create policy "user_tendencies_select_own"
  on public.user_tendencies for select
  using (user_id = auth.uid());

drop policy if exists "user_tendencies_insert_own" on public.user_tendencies;
create policy "user_tendencies_insert_own"
  on public.user_tendencies for insert
  with check (user_id = auth.uid());

drop policy if exists "user_tendencies_update_own" on public.user_tendencies;
create policy "user_tendencies_update_own"
  on public.user_tendencies for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- recommendation_scores (option을 거쳐 decision의 user_id 검증)
alter table public.recommendation_scores enable row level security;

drop policy if exists "recommendation_scores_select_via_option" on public.recommendation_scores;
create policy "recommendation_scores_select_via_option"
  on public.recommendation_scores for select
  using (exists (
    select 1 from public.options o
    join public.decisions d on d.id = o.decision_id
    where o.id = recommendation_scores.option_id and d.user_id = auth.uid()
  ));

drop policy if exists "recommendation_scores_insert_via_option" on public.recommendation_scores;
create policy "recommendation_scores_insert_via_option"
  on public.recommendation_scores for insert
  with check (exists (
    select 1 from public.options o
    join public.decisions d on d.id = o.decision_id
    where o.id = recommendation_scores.option_id and d.user_id = auth.uid()
  ));

drop policy if exists "recommendation_scores_update_via_option" on public.recommendation_scores;
create policy "recommendation_scores_update_via_option"
  on public.recommendation_scores for update
  using (exists (
    select 1 from public.options o
    join public.decisions d on d.id = o.decision_id
    where o.id = recommendation_scores.option_id and d.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.options o
    join public.decisions d on d.id = o.decision_id
    where o.id = recommendation_scores.option_id and d.user_id = auth.uid()
  ));

drop policy if exists "recommendation_scores_delete_via_option" on public.recommendation_scores;
create policy "recommendation_scores_delete_via_option"
  on public.recommendation_scores for delete
  using (exists (
    select 1 from public.options o
    join public.decisions d on d.id = o.decision_id
    where o.id = recommendation_scores.option_id and d.user_id = auth.uid()
  ));

-- criteria_templates (시스템 기본 + 본인 것 읽기, 본인 것만 쓰기)
alter table public.criteria_templates enable row level security;

drop policy if exists "criteria_templates_select_own_or_system" on public.criteria_templates;
create policy "criteria_templates_select_own_or_system"
  on public.criteria_templates for select
  using (is_system = true or user_id = auth.uid());

drop policy if exists "criteria_templates_insert_own" on public.criteria_templates;
create policy "criteria_templates_insert_own"
  on public.criteria_templates for insert
  with check (is_system = false and user_id = auth.uid());

drop policy if exists "criteria_templates_update_own" on public.criteria_templates;
create policy "criteria_templates_update_own"
  on public.criteria_templates for update
  using (is_system = false and user_id = auth.uid())
  with check (is_system = false and user_id = auth.uid());

drop policy if exists "criteria_templates_delete_own" on public.criteria_templates;
create policy "criteria_templates_delete_own"
  on public.criteria_templates for delete
  using (is_system = false and user_id = auth.uid());
