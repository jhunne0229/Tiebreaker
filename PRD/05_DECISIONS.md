# 타이브레이커 -- 결정 기록 (Resolved Clarifications)

> README의 [NEEDS CLARIFICATION] 15건을 모두 추천안대로 확정.
> 결정일: 2026-05-07

---

## PRD 관련

| 항목 | 결정 | 비고 |
|------|------|------|
| AI 비용 한도 | 사용자별 일일 횟수 제한 (안전장치) | 무제한은 비용 폭주 위험 |
| 일일 분석 횟수 | 사용자당 하루 20회 | `DAILY_ANALYSIS_LIMIT` 환경변수로 조절 |
| 회원 탈퇴 시 데이터 | 30일 유예 후 삭제 | 실수 복구 가능, GDPR 호환 |
| AI 응답 언어 | 사용자 입력 언어 자동 감지 | 한국어 우선, 영문 입력 시 영문 응답 |
| 분석 결과 캐싱 | 동일 결정+톤이면 캐시 사용 (24h TTL) | 비용 절감, 사용자가 명시적 "다시 분석" 시 무시 |
| 소셜 로그인 제공자 | Phase 1은 Google만 | 카카오는 Phase 2 |

## 데이터 모델 관련

| 항목 | 결정 | 비고 |
|------|------|------|
| Decision.type enum | daily / career / purchase / relationship / other | 5종 시작, 부족하면 확장 |
| Decision.tone enum | logical / emotional / blunt | 3종 고정 |
| AI 분석 결과 버전 관리 | 누적 (덮어쓰기 X) | 톤 바꿔서 재분석 시 이전 결과 보존 |
| Score 생성 방식 | AI 자동 생성 + 사용자가 슬라이더로 조정 가능 | 빈 표 채우기 부담 ↓ |

## 프로젝트 스펙 관련

| 항목 | 결정 | 비고 |
|------|------|------|
| AI 응답 형식 | Anthropic tool_use (JSON 스키마 보장) | 자유 텍스트 파싱 회피 |
| 비교표 점수 매기기 | AI 자동 + 사용자 수동 조정 가능 | 위 Score 결정과 동일 |
| 일일 횟수 제한 구현 | Next.js API route 미들웨어에서 Supabase 카운트 조회 | Edge Function 추가 부담 X |
| 카카오 로그인 시점 | Phase 2 | Google만으로 본인+지인 충분 |
| 분석 중단(취소) | Phase 1 포함 | AbortController로 fetch 중단 — UX 핵심 |

---

## 변경 이력
- 2026-05-07: 초기 결정 (모든 항목 추천안 채택)
