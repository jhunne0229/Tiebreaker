-- 분석 결과 누적 INSERT(0001~0004 시점 동작)으로 인해 같은 (decision_id, tone)에
-- 여러 run의 pros_cons / swot row가 쌓인 상태를 정리한다.
-- 동일 (decision_id, tone) 그룹에서 가장 최근 batch만 남김.
--   - "최근 batch": MAX(created_at) 기준 10초 이내. 단일 .insert(rows) 배치는 같은
--     트랜잭션이라 마이크로초 단위 차이만 있고, 별도 분석 run은 보통 수 초 이상 떨어져 있음.
-- 사용자 직접 추가 항목(ai_generated=false)은 보존.

with latest_pros as (
  select decision_id, tone, max(created_at) as max_at
  from public.pros_cons_items
  where ai_generated = true
  group by decision_id, tone
)
delete from public.pros_cons_items pc
using latest_pros l
where pc.decision_id = l.decision_id
  and pc.tone = l.tone
  and pc.ai_generated = true
  and pc.created_at < l.max_at - interval '10 seconds';

with latest_swot as (
  select decision_id, tone, max(created_at) as max_at
  from public.swot_items
  where ai_generated = true
  group by decision_id, tone
)
delete from public.swot_items s
using latest_swot l
where s.decision_id = l.decision_id
  and s.tone = l.tone
  and s.ai_generated = true
  and s.created_at < l.max_at - interval '10 seconds';

-- 공유 페이지에서 현재 톤만 보여주려면 tone 컬럼이 노출되어야 함.
-- 주의: create or replace view 는 새 컬럼을 "끝에만" 추가할 수 있다 — 중간에 끼우면
-- 기존 컬럼 rename으로 해석되어 42P16 에러 발생. 그래서 tone 을 맨 끝에 둔다.
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
  decided_at,
  tone
from public.decisions
where share_token is not null;

grant select on public.decision_share_view to anon, authenticated;
