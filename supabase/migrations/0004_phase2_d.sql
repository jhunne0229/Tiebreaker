-- 타이브레이커 Phase 2 Slice D — 회고 알림 인프라
-- 신규 테이블: push_subscriptions
-- 신규 컬럼: decisions.last_review_alert_at (중복 발송 방지용 타임스탬프 — review 미작성 시에도 cron 재발송 방지)
-- 실행: Supabase 대시보드 → SQL Editor

-- ─── PUSH SUBSCRIPTIONS ──────────────────────────────────
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  unique (user_id, endpoint)
);

create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

drop policy if exists "push_subscriptions_select_own" on public.push_subscriptions;
create policy "push_subscriptions_select_own"
  on public.push_subscriptions for select
  using (user_id = auth.uid());

drop policy if exists "push_subscriptions_insert_own" on public.push_subscriptions;
create policy "push_subscriptions_insert_own"
  on public.push_subscriptions for insert
  with check (user_id = auth.uid());

drop policy if exists "push_subscriptions_delete_own" on public.push_subscriptions;
create policy "push_subscriptions_delete_own"
  on public.push_subscriptions for delete
  using (user_id = auth.uid());

-- ─── DECISIONS: 알림 중복 방지 ───────────────────────────
-- review가 아직 없어도 알림이 한 번 발송됐으면 다음 cron tick에서 재발송 안 되게 표시.
-- week_1 알림 발송 시 채워두고, month_1 알림 발송 시 갱신. cron에서 review 없음 + last_alert가 적절히 오래됐을 때만 발송.
alter table public.decisions
  add column if not exists last_review_alert_at timestamptz;
