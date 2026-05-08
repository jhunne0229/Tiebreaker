-- 타이브레이커 RLS 정책
-- 모든 테이블에 user_id == auth.uid() 정책 필수 (PROJECT_SPEC.md "절대 하지 마")
-- 재실행 안전 (drop policy if exists → create policy)

-- ─── PROFILES ────────────────────────────────────────────
alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select
  using (id = auth.uid());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- ─── DECISIONS ───────────────────────────────────────────
alter table public.decisions enable row level security;

drop policy if exists "decisions_select_own" on public.decisions;
create policy "decisions_select_own"
  on public.decisions for select
  using (user_id = auth.uid());

drop policy if exists "decisions_insert_own" on public.decisions;
create policy "decisions_insert_own"
  on public.decisions for insert
  with check (user_id = auth.uid());

drop policy if exists "decisions_update_own" on public.decisions;
create policy "decisions_update_own"
  on public.decisions for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "decisions_delete_own" on public.decisions;
create policy "decisions_delete_own"
  on public.decisions for delete
  using (user_id = auth.uid());

-- ─── 자식 테이블: decisions의 소유자만 접근 ─────────────
-- options
alter table public.options enable row level security;

drop policy if exists "options_select_via_decision" on public.options;
create policy "options_select_via_decision"
  on public.options for select
  using (exists (select 1 from public.decisions d where d.id = options.decision_id and d.user_id = auth.uid()));

drop policy if exists "options_insert_via_decision" on public.options;
create policy "options_insert_via_decision"
  on public.options for insert
  with check (exists (select 1 from public.decisions d where d.id = options.decision_id and d.user_id = auth.uid()));

drop policy if exists "options_update_via_decision" on public.options;
create policy "options_update_via_decision"
  on public.options for update
  using (exists (select 1 from public.decisions d where d.id = options.decision_id and d.user_id = auth.uid()))
  with check (exists (select 1 from public.decisions d where d.id = options.decision_id and d.user_id = auth.uid()));

drop policy if exists "options_delete_via_decision" on public.options;
create policy "options_delete_via_decision"
  on public.options for delete
  using (exists (select 1 from public.decisions d where d.id = options.decision_id and d.user_id = auth.uid()));

-- criteria
alter table public.criteria enable row level security;

drop policy if exists "criteria_select_via_decision" on public.criteria;
create policy "criteria_select_via_decision"
  on public.criteria for select
  using (exists (select 1 from public.decisions d where d.id = criteria.decision_id and d.user_id = auth.uid()));

drop policy if exists "criteria_insert_via_decision" on public.criteria;
create policy "criteria_insert_via_decision"
  on public.criteria for insert
  with check (exists (select 1 from public.decisions d where d.id = criteria.decision_id and d.user_id = auth.uid()));

drop policy if exists "criteria_update_via_decision" on public.criteria;
create policy "criteria_update_via_decision"
  on public.criteria for update
  using (exists (select 1 from public.decisions d where d.id = criteria.decision_id and d.user_id = auth.uid()))
  with check (exists (select 1 from public.decisions d where d.id = criteria.decision_id and d.user_id = auth.uid()));

drop policy if exists "criteria_delete_via_decision" on public.criteria;
create policy "criteria_delete_via_decision"
  on public.criteria for delete
  using (exists (select 1 from public.decisions d where d.id = criteria.decision_id and d.user_id = auth.uid()));

-- scores (option을 거쳐 decision의 user_id 검증)
alter table public.scores enable row level security;

drop policy if exists "scores_select_via_option" on public.scores;
create policy "scores_select_via_option"
  on public.scores for select
  using (exists (
    select 1 from public.options o
    join public.decisions d on d.id = o.decision_id
    where o.id = scores.option_id and d.user_id = auth.uid()
  ));

drop policy if exists "scores_insert_via_option" on public.scores;
create policy "scores_insert_via_option"
  on public.scores for insert
  with check (exists (
    select 1 from public.options o
    join public.decisions d on d.id = o.decision_id
    where o.id = scores.option_id and d.user_id = auth.uid()
  ));

drop policy if exists "scores_update_via_option" on public.scores;
create policy "scores_update_via_option"
  on public.scores for update
  using (exists (
    select 1 from public.options o
    join public.decisions d on d.id = o.decision_id
    where o.id = scores.option_id and d.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.options o
    join public.decisions d on d.id = o.decision_id
    where o.id = scores.option_id and d.user_id = auth.uid()
  ));

drop policy if exists "scores_delete_via_option" on public.scores;
create policy "scores_delete_via_option"
  on public.scores for delete
  using (exists (
    select 1 from public.options o
    join public.decisions d on d.id = o.decision_id
    where o.id = scores.option_id and d.user_id = auth.uid()
  ));

-- pros_cons_items
alter table public.pros_cons_items enable row level security;

drop policy if exists "pros_cons_select_via_decision" on public.pros_cons_items;
create policy "pros_cons_select_via_decision"
  on public.pros_cons_items for select
  using (exists (select 1 from public.decisions d where d.id = pros_cons_items.decision_id and d.user_id = auth.uid()));

drop policy if exists "pros_cons_insert_via_decision" on public.pros_cons_items;
create policy "pros_cons_insert_via_decision"
  on public.pros_cons_items for insert
  with check (exists (select 1 from public.decisions d where d.id = pros_cons_items.decision_id and d.user_id = auth.uid()));

drop policy if exists "pros_cons_update_via_decision" on public.pros_cons_items;
create policy "pros_cons_update_via_decision"
  on public.pros_cons_items for update
  using (exists (select 1 from public.decisions d where d.id = pros_cons_items.decision_id and d.user_id = auth.uid()))
  with check (exists (select 1 from public.decisions d where d.id = pros_cons_items.decision_id and d.user_id = auth.uid()));

drop policy if exists "pros_cons_delete_via_decision" on public.pros_cons_items;
create policy "pros_cons_delete_via_decision"
  on public.pros_cons_items for delete
  using (exists (select 1 from public.decisions d where d.id = pros_cons_items.decision_id and d.user_id = auth.uid()));

-- swot_items
alter table public.swot_items enable row level security;

drop policy if exists "swot_select_via_decision" on public.swot_items;
create policy "swot_select_via_decision"
  on public.swot_items for select
  using (exists (select 1 from public.decisions d where d.id = swot_items.decision_id and d.user_id = auth.uid()));

drop policy if exists "swot_insert_via_decision" on public.swot_items;
create policy "swot_insert_via_decision"
  on public.swot_items for insert
  with check (exists (select 1 from public.decisions d where d.id = swot_items.decision_id and d.user_id = auth.uid()));

drop policy if exists "swot_update_via_decision" on public.swot_items;
create policy "swot_update_via_decision"
  on public.swot_items for update
  using (exists (select 1 from public.decisions d where d.id = swot_items.decision_id and d.user_id = auth.uid()))
  with check (exists (select 1 from public.decisions d where d.id = swot_items.decision_id and d.user_id = auth.uid()));

drop policy if exists "swot_delete_via_decision" on public.swot_items;
create policy "swot_delete_via_decision"
  on public.swot_items for delete
  using (exists (select 1 from public.decisions d where d.id = swot_items.decision_id and d.user_id = auth.uid()));

-- analysis_logs
alter table public.analysis_logs enable row level security;

drop policy if exists "analysis_logs_select_own" on public.analysis_logs;
create policy "analysis_logs_select_own"
  on public.analysis_logs for select
  using (user_id = auth.uid());

drop policy if exists "analysis_logs_insert_own" on public.analysis_logs;
create policy "analysis_logs_insert_own"
  on public.analysis_logs for insert
  with check (user_id = auth.uid());
