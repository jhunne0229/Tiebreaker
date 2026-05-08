# 타이브레이커(Tiebreaker) -- 디자인 문서

> Show Me The PRD로 생성됨 (2026-05-07)

결정 못 내릴 때 AI가 장단점 / 비교표 / SWOT을 한 번에 보여주는 개인용 의사결정 도우미.

---

## 문서 구성

| 문서 | 내용 | 언제 읽나 |
|------|------|----------|
| [01_PRD.md](./01_PRD.md) | 뭘 만드는지, 누가 쓰는지, 핵심 가치 | 프로젝트 시작 전 한 번 |
| [02_DATA_MODEL.md](./02_DATA_MODEL.md) | 데이터 구조 (User/Decision/Option/Score 등) | DB 설계할 때, 마이그레이션 짤 때 |
| [03_PHASES.md](./03_PHASES.md) | 단계별 계획 (MVP / 확장 / 고도화) | Phase 시작할 때 |
| [04_PROJECT_SPEC.md](./04_PROJECT_SPEC.md) | 기술 스택, AI 행동 규칙 | AI에게 코드 시킬 때마다 |
| [05_DECISIONS.md](./05_DECISIONS.md) | 미결 사항 15건의 확정안 | 구현 중 의사결정 막힐 때 |

---

## 한눈에 보는 요약

- **타깃**: 본인 + 지인 (개인 사용자)
- **플랫폼**: 웹 (반응형) → Phase 2에 PWA
- **스택**: Next.js 15 + Supabase + Vercel + Anthropic Claude API
- **인증**: Google OAuth (Supabase Auth)
- **MVP 기능**: 결정 입력 + 장단점/비교표(가중치)/SWOT 자동 분석 + 톤 조절 + 히스토리

---

## 다음 단계

Phase 1을 시작하려면:
1. Anthropic Console에서 API 키 발급
2. Supabase 프로젝트 생성
3. Google Cloud Console에서 OAuth 클라이언트 발급
4. [03_PHASES.md](./03_PHASES.md)의 "Phase 1 시작 프롬프트"를 AI에게 그대로 붙여넣기

---

## 미결 사항

모두 추천안대로 확정 (2026-05-07). 상세는 [05_DECISIONS.md](./05_DECISIONS.md) 참조.
