# 타이브레이커(Tiebreaker) -- 프로젝트 스펙

> AI가 코드를 짤 때 지켜야 할 규칙과 절대 하면 안 되는 것.
> 이 문서를 AI에게 항상 함께 공유하세요.

---

## 기술 스택

| 영역 | 선택 | 이유 |
|------|------|------|
| 프레임워크 | Next.js 15 (App Router) | AI 코딩 도구 호환성 최상, Vercel 배포 한 번에, 풀스택 단일 코드베이스 |
| 언어 | TypeScript | 타입 안전, AI가 코드 자동완성 정확도 ↑ |
| 스타일링 | Tailwind CSS 4 + shadcn/ui | 2026년 Next 표준, AI가 가장 잘 짜는 조합 |
| DB/백엔드 | Supabase (Postgres + Auth) | 무료 시작, RLS로 보안 간단, 바이브코더 친화 |
| 인증 | Supabase Auth (Google OAuth) | 별도 백엔드 없이 소셜 로그인 처리 |
| AI | Anthropic Claude API (claude-sonnet-4-6) | 한국어 자연어 분석 강점, 스트리밍 지원, 캐싱으로 비용 절감 |
| 배포 | Vercel | Git 연동 자동 배포, Next.js 1급 시민, 무료 티어 충분 |
| PWA (Phase 2+) | next-pwa | Next.js 공식 가이드, 매니페스트/서비스워커 자동 |

---

## 프로젝트 구조

```
tiebreaker/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── page.tsx            # 홈 (히스토리 목록)
│   │   ├── new/page.tsx        # 새 결정 입력
│   │   ├── decisions/[id]/page.tsx  # 결정 상세
│   │   ├── login/page.tsx      # 로그인
│   │   ├── api/
│   │   │   └── analyze/route.ts     # AI 분석 API (스트리밍)
│   │   └── layout.tsx
│   ├── components/             # 재사용 UI (shadcn/ui)
│   │   ├── decision-form.tsx
│   │   ├── pros-cons-list.tsx
│   │   ├── comparison-table.tsx
│   │   ├── swot-grid.tsx
│   │   └── tone-selector.tsx
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts       # 클라이언트 사이드
│   │   │   └── server.ts       # 서버 사이드
│   │   ├── claude.ts           # Anthropic SDK 설정 + 프롬프트
│   │   └── prompts/
│   │       ├── pros-cons.ts
│   │       ├── comparison.ts
│   │       └── swot.ts
│   └── types/
│       ├── database.ts         # Supabase 자동 생성 타입
│       └── domain.ts           # Decision, Option 등 도메인 타입
├── supabase/
│   ├── migrations/             # SQL 마이그레이션
│   └── seed.sql                # 시드 데이터
├── public/
├── .env.local                  # 환경변수 (Git 제외)
├── .env.example                # 환경변수 예시 (Git 포함)
└── package.json
```

---

## 절대 하지 마 (DO NOT)

> AI에게 코드를 시킬 때 이 목록을 반드시 함께 공유하세요.

- [ ] API 키나 비밀번호를 코드에 직접 쓰지 마 (.env.local만 사용)
- [ ] Anthropic API 키를 클라이언트 사이드 코드에 노출하지 마 (반드시 서버 라우트 경유)
- [ ] Supabase service_role 키를 클라이언트에서 쓰지 마 (anon key만 클라이언트, service_role은 서버 전용)
- [ ] RLS 정책 없이 테이블을 만들지 마 (`user_id = auth.uid()` 정책 필수)
- [ ] 기존 DB 스키마를 임의로 변경하지 마 (마이그레이션 파일로만)
- [ ] 목업/하드코딩 데이터로 완성이라고 하지 마
- [ ] AI 응답을 페이크로 만들어두고 동작한다고 말하지 마 (실제 Claude API 호출 필수)
- [ ] package.json의 기존 의존성 버전을 임의로 변경하지 마
- [ ] Phase 1 범위 밖 기능을 미리 구현하지 마 (회고 알림, PWA, 공유 링크는 Phase 2)
- [ ] 사용자 입력을 그대로 LLM에 넣을 때 프롬프트 인젝션 방어 고려 안 하지 마 (시스템 프롬프트로 역할 고정)
- [ ] 결정 데이터를 Anthropic에 보낼 때 사용자 PII (이메일, 전화번호 등)를 그대로 포함하지 마
- [ ] 다크모드/다국어/관리자 페이지 같은 Out of Scope 기능을 자발적으로 추가하지 마

---

## 항상 해 (ALWAYS DO)

- [ ] 변경하기 전에 변경할 파일 목록과 의도를 먼저 보여줘
- [ ] 환경변수는 .env.local에 저장 (.env.example로 키 이름만 공유)
- [ ] 에러는 사용자에게 친절한 메시지로 표시 ("잠시 후 다시 시도해주세요" 등)
- [ ] 모바일 반응형 (Tailwind sm:/md:/lg: 활용, 최소 320px 폭 지원)
- [ ] AI 응답은 스트리밍 (Server-Sent Events) — 체감 속도 핵심
- [ ] AI 호출 시 시스템 프롬프트로 역할 고정 ("당신은 의사결정 분석가입니다, 결과를 JSON으로...")
- [ ] AI 출력은 JSON 스키마로 받기 (자유 텍스트 파싱 X — Claude의 tool_use 또는 JSON mode 활용)
- [ ] Supabase 쿼리는 항상 RLS가 작동하는 anon/authenticated 클라이언트로
- [ ] 로딩 상태 명시적 UI (skeleton 또는 spinner)
- [ ] 분석 실패 시 재시도 버튼 제공
- [ ] 한국어 우선 UI (영문 fallback 없음 Phase 1)

---

## AI 호출 가이드라인 (claude-api 스킬 활용)

이 프로젝트는 Claude API를 핵심으로 사용합니다. AI 코딩 시 `claude-api` 스킬이 자동 활성화되어야 합니다.

- **모델**: `claude-sonnet-4-6` (균형, 한국어 강점)
- **프롬프트 캐싱**: 시스템 프롬프트는 길이가 긴 경우 cache_control로 캐싱 (분석 3종이 같은 시스템 프롬프트 공유 시)
- **스트리밍**: `stream: true`로 사용자 체감 응답 시간 단축
- **출력 형식**: JSON tool_use 또는 system prompt에 JSON 스키마 명시
- **에러 핸들링**: rate limit, timeout, 모델 거부 응답 모두 처리

---

## 테스트 방법

```powershell
# 의존성 설치
npm install

# 로컬 실행 (http://localhost:3000)
npm run dev

# 타입 체크
npx tsc --noEmit

# 린트
npm run lint

# 빌드 확인
npm run build

# Supabase 로컬 (선택)
npx supabase start
```

---

## 배포 방법

### Vercel
1. GitHub에 push
2. Vercel 대시보드에서 Import Repository
3. 환경변수 등록 (.env.local 내용을 Vercel Settings → Environment Variables에)
4. 자동 배포 — 이후 main push마다 자동 배포

### Supabase
1. https://supabase.com 에서 프로젝트 생성
2. SQL Editor에서 `supabase/migrations/*.sql` 순서대로 실행
3. Authentication → Providers에서 Google OAuth 활성화 (Google Cloud Console에서 OAuth 클라이언트 발급)
4. URL Configuration에 Vercel 배포 URL 등록 (redirect URL)

---

## 환경변수

| 변수명 | 설명 | 어디서 발급 |
|--------|------|------------|
| NEXT_PUBLIC_SUPABASE_URL | Supabase 프로젝트 URL | Supabase 대시보드 → Settings → API |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | Supabase anon 키 (클라이언트용) | Supabase 대시보드 → Settings → API |
| SUPABASE_SERVICE_ROLE_KEY | Supabase service_role 키 (서버 전용) | Supabase 대시보드 → Settings → API |
| ANTHROPIC_API_KEY | Claude API 키 | https://console.anthropic.com |
| GOOGLE_CLIENT_ID | Google OAuth 클라이언트 ID | https://console.cloud.google.com |
| GOOGLE_CLIENT_SECRET | Google OAuth 시크릿 | https://console.cloud.google.com |

> .env.local 파일에 저장. .gitignore에 .env.local 포함되어 있는지 확인. 절대 GitHub에 올리지 마세요.

---

## [NEEDS CLARIFICATION]

- [ ] AI 응답을 JSON tool_use로 받을지 vs system prompt JSON 스키마 명시 — 안정성 vs 단순성 트레이드오프
- [ ] 비교표 가중치 점수 매기기를 AI 자동 vs 사용자 수동으로 시작할지 (Phase 1 간소화 위해 AI 자동 권장)
- [ ] 일일 분석 횟수 제한 구현 위치 — Supabase Edge Function vs Next.js API route
- [ ] 카카오 로그인 추가 시점 — Phase 1 같이 vs Phase 2
- [ ] 분석 중 요청 취소(중단) 기능 — Phase 1 포함 여부
