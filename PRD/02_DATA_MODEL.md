# 타이브레이커(Tiebreaker) -- 데이터 모델

> 이 문서는 앱에서 다루는 핵심 데이터의 구조를 정의합니다.
> 개발자가 아니어도 이해할 수 있는 "개념적 ERD"입니다.

---

## 전체 구조

```
[User] --1:N--> [Decision] --1:N--> [Option] --1:N--> [Score] --N:1--> [Criteria]
                    |
                    +--1:N--> [ProsConItem]   (장점/단점 리스트)
                    |
                    +--1:N--> [SwotItem]      (S/W/O/T 4사분면)
                    |
                    +--1:N--> [Review]        (회고 — Phase 2)
                    |
                    +--1:N--> [Criteria]      (비교 기준)
                    |
                    +--N:1--> Option (final_choice_id, 최종 선택)
```

### 한국어 풀이
- 사용자 한 명은 여러 개의 결정을 가질 수 있다
- 결정 하나에는 여러 개의 옵션(선택지)이 있다
- 결정 하나에는 여러 개의 비교 기준이 있다
- 옵션 × 기준 = 점수 (예: "새 회사" × "연봉" = 9점)
- 결정 하나에는 장단점/SWOT 항목이 여러 개씩 있다
- 결정 하나에는 회고가 여러 번 달릴 수 있다 (1주 후, 1개월 후 등)

---

## 엔티티 상세

### User
앱 사용자. 소셜 로그인으로 가입.

| 필드 | 설명 | 예시 | 필수 |
|------|------|------|------|
| id | 고유 식별자 (Supabase Auth UUID) | abc-123-... | O |
| email | 이메일 (소셜 로그인에서 가져옴) | jiyoon@example.com | O |
| name | 표시 이름 | 여지윤 | O |
| avatar_url | 프로필 사진 URL | https://... | X |
| created_at | 가입일 | 2026-05-07 | O |

---

### Decision
사용자가 입력한 하나의 결정 단위.

| 필드 | 설명 | 예시 | 필수 |
|------|------|------|------|
| id | 결정 ID | dec-001 | O |
| user_id | 누구의 결정 | abc-123-... | O |
| title | 결정 제목 | "이직할까 말까" | O |
| context | 맥락 설명 (자연어) | "현재 연봉 5천, 새 회사는 6천..." | X |
| type | 결정 유형 | daily / career / purchase / other | O |
| tone | AI 분석 톤 | logical / emotional / blunt | O (기본 logical) |
| status | 상태 | open (분석 중) / decided (결정 완료) | O |
| final_choice_id | 최종 선택한 옵션 | opt-007 | X |
| final_note | 본인 결정 메모 | "결국 통근 부담 때문에 현재 회사 유지" | X |
| created_at | 만든 날짜 | 2026-05-07 | O |
| decided_at | 결정 완료 일시 | 2026-05-08 | X |

---

### Option
하나의 결정에 속한 선택지. 보통 2-4개.

| 필드 | 설명 | 예시 | 필수 |
|------|------|------|------|
| id | 옵션 ID | opt-001 | O |
| decision_id | 어느 결정에 속하는지 | dec-001 | O |
| name | 옵션 이름 | "새 회사 이직" | O |
| description | 옵션 설명 | "스타트업 A, 연봉 6000만원" | X |
| created_at | 만든 날짜 | 2026-05-07 | O |

---

### Criteria (비교 기준)
사용자가 정의한 비교 항목. 가중치 1-5점.

| 필드 | 설명 | 예시 | 필수 |
|------|------|------|------|
| id | 기준 ID | crit-001 | O |
| decision_id | 어느 결정에 속하는지 | dec-001 | O |
| name | 기준 이름 | "연봉" / "출퇴근 시간" / "성장성" | O |
| weight | 가중치 (1-5, 클수록 중요) | 5 | O |
| created_at | 만든 날짜 | 2026-05-07 | O |

---

### Score (옵션별 기준 점수)
옵션 × 기준의 교차점. AI가 매기거나 사용자가 직접 조정.

| 필드 | 설명 | 예시 | 필수 |
|------|------|------|------|
| id | 점수 ID | sc-001 | O |
| option_id | 어느 옵션 | opt-001 | O |
| criteria_id | 어느 기준 | crit-001 | O |
| value | 점수 (1-10) | 9 | O |
| reasoning | AI가 점수를 준 근거 | "연봉이 1000만원 더 높음" | X |
| created_at | 만든 날짜 | 2026-05-07 | O |

> 가중 합산: 옵션의 최종 점수 = Σ (Score.value × Criteria.weight)

---

### ProsConItem (장단점 항목)
결정 또는 특정 옵션의 장점/단점.

| 필드 | 설명 | 예시 | 필수 |
|------|------|------|------|
| id | 항목 ID | pc-001 | O |
| decision_id | 어느 결정 | dec-001 | O |
| option_id | 어느 옵션 (전체 결정에 대한 항목이면 null) | opt-001 또는 null | X |
| kind | 종류 | pro / con | O |
| text | 내용 | "성장 기회가 더 많음" | O |
| ai_generated | AI가 만든 건지 | true | O |
| created_at | 만든 날짜 | 2026-05-07 | O |

---

### SwotItem (SWOT 4사분면 항목)
S/W/O/T 각각의 항목.

| 필드 | 설명 | 예시 | 필수 |
|------|------|------|------|
| id | 항목 ID | sw-001 | O |
| decision_id | 어느 결정 | dec-001 | O |
| option_id | 어느 옵션 (결정 전체면 null) | opt-001 또는 null | X |
| quadrant | 4사분면 | S / W / O / T | O |
| text | 내용 | "(S) 새 분야 전문성 확보" | O |
| ai_generated | AI가 만든 건지 | true | O |
| created_at | 만든 날짜 | 2026-05-07 | O |

---

### Review (회고 — Phase 2)
결정 후 일정 시간 뒤 작성하는 회고.

| 필드 | 설명 | 예시 | 필수 |
|------|------|------|------|
| id | 회고 ID | rv-001 | O |
| decision_id | 어느 결정 | dec-001 | O |
| reviewed_at | 회고 작성일 | 2026-06-07 | O |
| rating | 결정 만족도 (1-5) | 4 | O |
| reflection | 자유 메모 | "역시 통근 부담 줄인 게 컸음" | X |
| trigger | 회고 트리거 | week_1 / month_1 / manual | O |

---

### 관계 요약
- User 1 -- N Decision (한 사람이 여러 결정)
- Decision 1 -- N Option (결정 하나에 옵션 여러 개)
- Decision 1 -- N Criteria (결정 하나에 기준 여러 개)
- Option × Criteria -- 1 Score (옵션-기준 교차점마다 점수 1개)
- Decision 1 -- N ProsConItem (장단점 여러 개)
- Decision 1 -- N SwotItem (SWOT 항목 여러 개)
- Decision 1 -- N Review (회고 여러 번 가능, Phase 2)
- Decision N -- 1 Option (final_choice_id, 최종 선택)

---

## 왜 이 구조인가

### 확장성
- **Phase 2 회고**: Review 테이블만 추가하면 됨. Decision의 status가 "decided"인 것에 대해 N:1로 붙음.
- **Phase 3 협업 결정**: User-Decision 관계를 별도 DecisionMember 테이블로 분리하면 여러 명이 한 결정에 참여 가능.
- **Phase 3 What-if 시뮬레이션**: Score, Criteria의 weight/value만 가상으로 바꿔서 재계산하면 되므로 추가 테이블 불필요.

### 단순성
- Pros/Cons와 SWOT을 별 테이블로 둔 이유: 둘 다 단순 텍스트 리스트지만 노출 UI/검색 패턴이 다름. 합치면 quadrant + kind 필드 둘 다 nullable이 되어 더 복잡해짐.
- AI 응답 캐싱은 별 테이블이 아니라 ProsConItem/SwotItem의 ai_generated 플래그로 처리. 같은 결정의 분석 결과가 그대로 누적된다.

### Supabase 특화
- **Row Level Security (RLS)**: 모든 테이블에 `user_id == auth.uid()` 정책 필수. Decision에서 user_id를 거쳐 자식 테이블 접근 권한 검증.
- **Realtime**: 협업 결정(Phase 3)에서 Score 변경을 실시간 푸시할 때 Supabase Realtime 사용 가능.

---

## [NEEDS CLARIFICATION]

- [ ] type 필드의 enum 종류 확정 — daily/career/purchase/other 외에 relationship/health 등 추가할지
- [ ] tone enum 확정 — logical/emotional/blunt 3종 vs 추가
- [ ] AI 분석 결과의 버전 관리 — 톤 바꿔서 재분석하면 이전 ProsConItem을 덮을지 vs 누적할지 (현재는 누적 가정)
- [ ] Score 자동 생성 vs 수동 입력 — Phase 1에서 AI가 자동으로 점수를 매겨줄지, 사용자가 직접 매길지
