# SQL-Tailor

**Web-based SQL/PL-SQL Beautifier** — 개발자들이 SQL 및 PL/SQL 스크립트의 가독성을 높이기 위한 웹 기반 코드 정렬 도구입니다.

---

## 1. 프로젝트 개요 (PRD)

SQL/PL-SQL 작성 시 발생하는 가독성 저하 문제를 해결하기 위한 웹 기반 정렬 도구입니다. 사용자가 정렬 규칙을 직접 제어하고, 정규식이나 AI를 활용해 복잡한 쿼리까지 정리하는 것을 목표로 합니다.

---

## 2. 핵심 목표

| 목표 | 설명 |
|------|------|
| **가독성 극대화** | 일관성 없는 줄 간격, 콤마 위치, 들여쓰기 문제 해결 |
| **사용자 자율성** | 서비스 강제 룰이 아닌, 사용자가 선택한 룰 적용 |
| **지속성** | 브라우저 재방문 시에도 이전 설정 유지 |
| **지능형 정렬** | LLM API 연동으로 복잡한 로직의 쿼리 정리 보조 |

---

## 3. 상세 기능 (Functional Requirements)

### 3.1 에디터 및 기본 정렬
- **듀얼 패널**: 왼쪽(Input)에 원본 SQL, 오른쪽(Output)에 정렬 결과 (실시간)
- **기본 포매팅 룰**
  - 예약어 대문자/소문자 변환
  - 콤마(,) 위치 설정 (Leading vs Trailing)
  - 들여쓰기 방식 설정 (Space / Tab / **Auto**)
  - 연산자 주변 공백 설정

### 3.2 규칙 관리 시스템 (Rule Control)

| 규칙 | 옵션 | 설명 |
|------|------|------|
| 예약어 대소문자 | 대문자 / 소문자 / 유지 | SQL 키워드 케이스 변환 |
| 콤마 위치 | 앞(Leading) / 뒤(Trailing) | 콤마를 줄 앞에 둘지 뒤에 둘지 |
| 들여쓰기 | Space / Tab / **Auto** | 들여쓰기 방식 선택 |
| 연산자 공백 | 공백 있음 / 공백 없음(Dense) | 연산자 전후 공백 여부 |

#### Auto 들여쓰기 규칙 상세

`들여쓰기 → 자동(AUTO)` 선택 시 아래 4가지 규칙이 자동 적용됩니다.

| Rule | 내용 |
|------|------|
| Rule 1 | `SELECT`, `FROM`, `WHERE`, `AND` 등 SQL 키워드마다 줄바꿈 |
| Rule 2 | 사용된 키워드 중 가장 긴 것 기준으로 나머지 키워드 우측 정렬 |
| Rule 3 | 키워드 뒤 첫 번째 내용은 2칸 공백으로 같은 줄에 연결 |
| Rule 4 | 서브쿼리는 `(` 바로 다음 위치를 기준으로 내부 정렬 |

**예시 출력:**
```sql
SELECT  O_CD
        , (SELECT  s.K_D_NM
             FROM  HDT s
            WHERE  s.D_CD = a.W_CD
          )  as W_NM, a.*
  FROM  MDT a
 WHERE  a.PT = '02459026'
   AND  a.O_YMD = '2026-03-13'
   AND  a.MND_CD = 'A'
```

### 3.3 커스텀 템플릿
- **텍스트 대체**: 특정 단어 일괄 변경 (예: `ISNULL` → `COALESCE`)
- **정규식(Regex)**: 패턴 검색 후 사용자 정의 포맷으로 변경

### 3.4 LLM API 연동 (Intelligent Assistant)
- **API Key 설정**: OpenAI 또는 Anthropic API Key 입력 후 로컬 저장
- **AI 정렬**: 복합적인 쿼리 가독성 개선 제안
- **미리보기 템플릿**: AI 결과를 "변경 전/후" 예시로 보여주고 적용 여부 선택

### 3.5 사용자 설정 저장
- **LocalStorage 활용**: 서버 DB 없이 정렬 규칙, On/Off 상태, API Key를 브라우저에 저장

---

## 4. 단계별 구현 가이드 및 진행 현황

### [1단계] 기초 레이아웃 및 Core 포매팅 기능 ✅
- **목표**: 좌우 분할 에디터 + 기본 포매팅 + 배너 공간
- **주요 내용**
  - 좌우로 분할된 텍스트 에디터 UI 구성 (Input / Output)
  - 기본 SQL 포매팅 적용 (sql-formatter 라이브러리)
  - 상단 배너 Placeholder (광고·공지용)

### [2단계] 규칙 제어 패널 ✅
- **목표**: 사용자가 정렬 옵션을 선택 가능
- **주요 내용**
  - 예약어 대소문자 / 콤마 위치 / 들여쓰기 / 연산자 공백 토글 및 옵션
  - 설정값 LocalStorage 저장 및 복원
  - 자체 SQL 포매팅 엔진 개발 (외부 라이브러리 탈피)

### [3단계] 커스텀 템플릿 ✅
- **목표**: 텍스트/정규식 대체 규칙 관리
- **주요 내용**
  - 추가/삭제/On-Off 가능한 대체 규칙 목록
  - 정규식 패턴 지원 및 오류 처리

### [4단계] AI 연동 및 프롬프트 최적화 ✅
- **목표**: LLM API 연동 및 AI 제안 UX
- **주요 내용**
  - API Key 입력창 및 유효성 검사 (OpenAI / Anthropic)
  - "AI 도움받기" 버튼으로 LLM 최적화 SQL 수신
  - 변경 전/후 미리보기 모달 후 Output 적용

### [5단계] Auto 들여쓰기 ✅
- **목표**: 키워드 기준 자동 정렬 기능 추가
- **주요 내용**
  - `autoIndentFormatter.ts` 코어 엔진 신규 개발
  - 규칙 제어 패널에 "자동(AUTO)" 옵션 추가
  - 서브쿼리 재귀 정렬 및 `(` 기준 위치 정렬 지원

---

## 5. 제외 사항 (Out of Scope)

- 사용자 회원가입 및 서버 기반 DB 저장
- SQL 문법 오류 체크(Syntax Validation) — 추후 검토
- 유료 결제 시스템

---

## 6. 실행 방법

```bash
# 의존성 설치
npm install

# 개발 서버 실행
npm run dev

# 빌드
npm run build

# 빌드 결과물 미리보기
npm run preview
```

---

## 7. 기술 스택

- **React 18** + **TypeScript**
- **Vite** (빌드·개발 서버)
- **자체 SQL 포매팅 엔진** (`src/lib/sql-formatter/`) — 외부 라이브러리 미사용
- **OpenAI API** / **Anthropic API** (AI 도움 시, 사용자 API Key 사용)

---

## 8. 프로젝트 구조

```
sql-tailor/
├── src/
│   ├── components/
│   │   ├── Banner.tsx              # 상단 배너 (Placeholder)
│   │   ├── EditorPanel.tsx         # Input/Output 에디터 패널
│   │   ├── RulePanel.tsx           # 규칙 제어 패널 (토글/라디오/AUTO)
│   │   ├── TemplatePanel.tsx       # 사용자 정의 템플릿 (텍스트/정규식)
│   │   ├── AiPanel.tsx             # API Key 설정 + AI 도움받기
│   │   └── AiPreviewModal.tsx      # AI 결과 변경 전/후 미리보기
│   ├── lib/
│   │   └── sql-formatter/          # 자체 SQL 포매팅 엔진
│   │       ├── index.ts
│   │       ├── README.md
│   │       ├── core/
│   │       │   ├── tokenizer.ts
│   │       │   ├── parser.ts
│   │       │   ├── formatter.ts
│   │       │   └── autoIndentFormatter.ts  ← Auto 들여쓰기 엔진
│   │       └── types/
│   │           ├── config.ts               ← IndentType에 'auto' 추가
│   │           └── token.ts
│   ├── types/
│   │   ├── formatRules.ts          # 포매팅 규칙 타입 (IndentType 'auto' 포함)
│   │   ├── customRules.ts          # 대체 규칙 타입
│   │   └── ai.ts                   # AI 프로바이더 타입
│   ├── utils/
│   │   ├── formatSql.ts            # 규칙 적용 포매팅 + Auto 후처리 연결
│   │   ├── applyReplaceRules.ts    # 텍스트/정규식 대체 적용
│   │   ├── aiFormat.ts             # OpenAI/Anthropic API 호출
│   │   └── storage.ts              # LocalStorage 관리
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css
├── doc/
│   ├── setup/                      # 단계별 구현 요약
│   └── dev/                        # 개발 작업 로그
├── index.html
├── package.json
├── tsconfig.json
└── vite.config.ts
```

---

*SQL-Tailor — SQL 내맘대로 정렬하기*  
*마지막 업데이트: 2026-03-17*
