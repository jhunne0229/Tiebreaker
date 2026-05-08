# 타이브레이커 (Tiebreaker)

결정 못 내릴 때 AI가 도와주는 의사결정 도우미.
선택지를 적으면 **장단점 · 가중 비교표 · SWOT**을 한 번에 분석해 주고, 톤(논리/감성/냉철)을 바꿔가며 다른 관점도 볼 수 있습니다.

> Phase 1 — Next.js 16 + Supabase + Anthropic Claude

---

## 기능

- Google 소셜 로그인 (Supabase Auth)
- 결정 입력 폼 (제목 / 배경 / N개 옵션)
- AI 3종 분석 (장단점, 비교표+가중점수, SWOT)
- 톤 컨트롤 (논리적 / 감성적 / 냉철한 친구) — 누적되며 덮어쓰지 않음
- SSE 스트리밍 + 분석 중단(Abort)
- 비교표 직접 편집 (기준 추가/삭제, 가중치/점수 조정)
- 최종 결정 저장 + 메모
- 결정 히스토리 (목록 / 검색 / 상세)
- 모바일 반응형

---

## 빠른 시작

```bash
npm install
cp .env.example .env.local   # PowerShell:  Copy-Item .env.example .env.local
# .env.local 의 값을 채운 뒤
npm run dev
```

브라우저로 http://localhost:3000 접속 → Google 로그인.

### 사용 가능한 스크립트

| 명령어 | 설명 |
| --- | --- |
| `npm run dev` | 개발 서버 (Turbopack) |
| `npm run build` | 프로덕션 빌드 |
| `npm run start` | 프로덕션 서버 |
| `npm run typecheck` | `tsc --noEmit` |

---

## 환경 설정

### 1) Supabase 프로젝트

1. https://supabase.com 에서 프로젝트 생성
2. **Settings → API** 에서 `Project URL`, `Publishable key`, `Secret key` 복사
   - 키는 2025년 후반부터 명명이 바뀌었음 (`anon` → `Publishable`, `service_role` → `Secret`)
3. `.env.local`의 다음 항목에 입력:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` (Publishable)
   - `SUPABASE_SERVICE_ROLE_KEY` (Secret — 서버 전용)

### 2) DB 마이그레이션

`supabase/migrations/` 의 SQL을 순서대로 실행하세요.

**옵션 A — Supabase 대시보드 (가장 간단)**

1. SQL Editor 열기
2. `0001_init.sql` 전체 붙여넣기 → Run
3. `0002_rls.sql` 전체 붙여넣기 → Run

**옵션 B — Supabase CLI**

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

마이그레이션이 만드는 것:
- 7개 테이블 (`profiles`, `decisions`, `options`, `criteria`, `scores`, `pros_cons_items`, `swot_items`, `analysis_logs`)
- 5개 enum (`decision_type`, `decision_tone`, `decision_status`, `pros_con_kind`, `swot_quadrant`)
- 모든 테이블에 RLS — 본인 데이터만 읽기/쓰기
- `auth.users` 신규 가입 시 `profiles` 자동 생성 트리거

### 3) Google OAuth

1. https://console.cloud.google.com → **APIs & Services → Credentials**
2. **OAuth client ID** 생성 (Web application)
3. **Authorized redirect URIs** 에 Supabase 콜백 URL 등록:
   ```
   https://<project-ref>.supabase.co/auth/v1/callback
   ```
4. Client ID / Secret 을 Supabase 대시보드 **Authentication → Providers → Google** 에 붙여넣고 Enable
5. **Authentication → URL Configuration** 에서 Site URL을 `http://localhost:3000` (프로덕션이면 실제 도메인)으로 설정
   - **Redirect URLs**(허용 목록)에 `http://localhost:3000/auth/callback` 추가

> Google 키는 Next.js 코드에서 직접 쓰이지 않습니다. Supabase가 OAuth 흐름을 처리하고 코드는 `supabase.auth.signInWithOAuth`만 호출합니다.

### 4) Anthropic API

1. https://console.anthropic.com → API Keys → Create Key
2. `.env.local` 의 `ANTHROPIC_API_KEY` 에 입력

### 5) 환경변수 요약

| 변수 | 위치 | 필수 |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | client + server | ✅ |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client + server | ✅ |
| `SUPABASE_SERVICE_ROLE_KEY` | server only | ✅ (현재 미사용 — 향후 백오피스용) |
| `ANTHROPIC_API_KEY` | server only | ✅ |
| `NEXT_PUBLIC_SITE_URL` | client | (배포 시 권장) |
| `DAILY_ANALYSIS_LIMIT` | server | 기본 20 |

---

## 아키텍처 메모

### 분석 파이프라인 (`/api/analyze`)

1. 요청 검증 + 로그인 체크
2. `decisions / options / criteria` 조회 (RLS)
3. 일일 한도 체크 (analysis_logs.status='success' 24h)
4. 입력 핑거프린트(SHA-256) 계산 — `(title, context, options, criteria, tone)`
5. **캐시 hit (24h)** 이면 즉시 SSE `done`
6. PII 마스킹 + `<user_input>` 인젝션 방어 래핑
7. Claude `messages.stream()` — `tool_use` 강제 (`tool_choice: { type:"tool", name:"submit_decision_analysis" }`)
8. `input_json_delta` 이벤트를 SSE `partial` 로 포워딩
9. 완성된 `tool_use.input` 으로:
   - `pros_cons_items`, `swot_items` **insert** (누적, tone 필드 포함)
   - 새 기준만 `criteria` insert (이름 충돌 시 재사용)
   - `scores` upsert (`option_id, criteria_id` 충돌 시 갱신)
   - `decisions.tone` 업데이트
   - `analysis_logs` row 추가 (캐시용)
10. `AbortController` 양방향 전파 — 클라이언트가 끊으면 Anthropic 업스트림도 끊김

### 누적 분석

같은 결정에 대해 톤을 바꿔 다시 분석해도 이전 결과는 보존됩니다 (`pros_cons_items.tone`, `swot_items.tone` 필드로 구분). `criteria/scores` 만 upsert로 갱신됩니다.

### 보안

- 모든 테이블에 RLS — 클라이언트가 다른 사용자 데이터를 절대 읽거나 쓸 수 없음
- 미들웨어가 보호된 라우트로의 비로그인 접근을 `/login?next=...` 로 리다이렉트
- 사용자 입력은 LLM 호출 전 PII(주민번호 / 카드 / 이메일 / 전화번호) 마스킹
- 사용자 입력은 `<user_input>...</user_input>` XML 태그로 래핑 + 시스템 프롬프트의 명시적 인젝션 방어 룰
- OAuth 콜백의 `next` 쿼리는 절대경로(`/`로 시작, `//` 거부) 만 허용

---

## 디렉토리 구조

```
src/
  app/
    api/
      analyze/route.ts          # SSE 스트리밍 엔드포인트
      decisions/[id]/
        criteria/route.ts       # 기준 추가/삭제/가중치 변경
        scores/route.ts         # 점수 수동 조정
        finalize/route.ts       # 최종 결정 저장
    auth/
      callback/route.ts         # OAuth 콜백
      signout/route.ts          # 로그아웃
    decisions/[id]/
      page.tsx                  # 결정 상세 (서버)
      decision-view.tsx         # 분석 컨트롤 + 탭 (클라)
    new/
      page.tsx                  # 새 결정 폼
      decision-form.tsx
      actions.ts                # 서버 액션
    login/page.tsx
    page.tsx                    # 히스토리 목록
  components/
    ui/                         # Button, Input, Tabs, Slider 등 프리미티브
    app-shell.tsx
    tone-selector.tsx
    pros-cons-list.tsx
    comparison-table.tsx
    swot-grid.tsx
    final-decision.tsx
  lib/
    supabase/{server,middleware,client}.ts
    prompts/analysis.ts         # 시스템 프롬프트 + tool input_schema
    sanitize.ts                 # PII 마스킹 + 인젝션 방어
    scoring.ts                  # 가중 합산 / 랭킹
    hash.ts                     # SHA-256
    claude.ts
  types/
    database.ts                 # Supabase Database 타입 (수동)
    domain.ts                   # 도메인 타입 + AnalysisToolInput
supabase/migrations/
  0001_init.sql
  0002_rls.sql
PRD/                            # 제품 기획서 (PRD, 데이터 모델, 결정사항)
```

---

## 알려진 제약 (Phase 1)

- 다국어 미지원 — 한국어 UI/프롬프트만
- 결정 공유 / 협업 미지원
- 분석 톤 변경 시 이전 분석은 누적되지만, **`criteria/scores` 는 덮어씀** (셀 단위 upsert)
- `SUPABASE_SERVICE_ROLE_KEY` 는 .env에만 존재 — 현재 코드에서는 사용 안 함 (관리자 도구 추가 시 사용 예정)
