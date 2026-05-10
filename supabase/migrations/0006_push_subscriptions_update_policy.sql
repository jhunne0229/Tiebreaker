-- 0004 가 select/insert/delete 만 추가하고 update RLS 정책을 빠뜨려,
-- upsert(...) onConflict 시 같은 (user_id, endpoint) 조합 두 번째 호출이 차단되던 문제.
-- INSERT ... ON CONFLICT DO UPDATE 는 INSERT + UPDATE 권한 둘 다 필요하므로
-- update 정책을 추가해 본인 row 갱신을 허용한다.

drop policy if exists "push_subscriptions_update_own" on public.push_subscriptions;
create policy "push_subscriptions_update_own"
  on public.push_subscriptions for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
