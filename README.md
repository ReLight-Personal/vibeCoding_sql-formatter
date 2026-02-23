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
- **듀얼 패널**: 왼쪽(Input)에 원본 SQL, 오른쪽(Output)에 정렬 결과 (실시간 또는 버튼 클릭)
- **기본 포매팅 룰**
  - 예약어 대문자/소문자 변환
  - 콤마(,) 위치 설정 (Leading vs Trailing)
  - 들여쓰기 너비 (Space vs Tab) 지정
  - 연산자 주변 공백 설정

### 3.2 규칙 관리 시스템 (Rule Control)
- **Rule Dashboard**: 적용 중인 모든 룰을 리스트로 노출
- **On/Off 토글**: 각 정렬 규칙 개별 활성화/비활성화
- **커스텀 템플릿**
  - **텍스트 대체**: 특정 단어 일괄 변경 (예: `ISNULL` → `COALESCE`)
  - **정규식(Regex)**: 패턴 검색 후 사용자 정의 포맷으로 변경

### 3.3 LLM API 연동 (Intelligent Assistant)
- **API Key 설정**: OpenAI 또는 Anthropic API Key 입력 후 로컬 저장
- **AI 정렬**: 복합적인 쿼리 가독성 개선 제안
- **미리보기 템플릿**: AI 결과를 "변경 전/후" 예시로 보여주고 적용 여부 선택

### 3.4 사용자 설정 저장
- **LocalStorage 활용**: 서버 DB 없이 정렬 규칙, On/Off 상태, API Key(보안 유의)를 브라우저에 저장

### 3.5 UI/UX 요소
- **배너 영역**: 상단/하단에 광고·공지사항용 Placeholder 확보
- **복사하기 버튼**: 정렬된 결과를 클립보드에 한 번에 복사

---

## 4. 단계별 구현 가이드 및 진행 현황

### [1단계] 기초 레이아웃 및 Core 포매팅 기능 ✅
- **목표**: 좌우 분할 에디터 + 기본 포매팅 + 배너 공간
- **주요 내용**
  - 좌우로 분할된 텍스트 에디터 UI 구성 (Input / Output)
  - 기본 SQL Formatter 라이브러리 연동
  - 버튼 클릭 시 **들여쓰기**, **대소문자 변환** 적용
  - 상단 배너 공간(Placeholder) 확보

### [2단계] 규칙 제어 패널 및 상태 관리 ✅
- **목표**: 정렬 규칙 On/Off 및 실시간 반영
- **주요 내용**
  - 정렬 규칙 On/Off 체크박스/토글 UI (예약어 대소문자, 콤마 위치, 들여쓰기, 연산자 공백)
  - 콤마 위치(앞/뒤) 라디오 버튼 (Leading / Trailing)
  - 들여쓰기: Space(2/4칸) / Tab 선택
  - 규칙 변경 시 Output 실시간 재반영

### [3단계] 사용자 정의 템플릿 (Regex/Replace) ✅
- **목표**: 텍스트·정규식 기반 대체 규칙 + 설정 유지
- **주요 내용**
  - 텍스트/정규식 대체 규칙 추가 입력 폼 (찾을 문자열, 바꿀 문자열)
  - 정렬 후 사용자 정의 규칙 순서대로 적용
  - 포맷 규칙 + 사용자 정의 규칙을 LocalStorage에 저장하여 새로고침 시 유지

### [4단계] AI 연동 및 프롬프트 최적화
- **목표**: LLM API 연동 및 AI 제안 UX
- **주요 내용**
  - API Key 입력창 및 유효성 검사
  - "AI 도움받기" 버튼: LLM에 쿼리·규칙 전달 후 최적화 결과 수신
  - AI 제안 결과를 템플릿 예시로 보여주고 적용 여부 묻는 UX

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
- **sql-formatter** (기본 SQL 포매팅)

---

## 8. 프로젝트 구조 (3단계 기준)

```
cursor_sql-formatter/
├── src/
│   ├── components/
│   │   ├── Banner.tsx        # 상단 배너(Placeholder)
│   │   ├── EditorPanel.tsx   # Input/Output 에디터 패널
│   │   ├── RulePanel.tsx     # 규칙 제어 패널 (토글/라디오)
│   │   └── TemplatePanel.tsx # 사용자 정의 템플릿 (텍스트/정규식)
│   ├── types/
│   │   ├── formatRules.ts    # 포매팅 규칙 타입 및 기본값
│   │   └── customRules.ts    # 대체 규칙 타입 (ReplaceRuleItem)
│   ├── utils/
│   │   ├── formatSql.ts      # 규칙 적용 포매팅 + 콤마 위치 후처리
│   │   ├── applyReplaceRules.ts # 텍스트/정규식 대체 적용
│   │   └── storage.ts        # LocalStorage 저장/로드
│   ├── App.tsx               # 메인 앱, 포맷·대체·저장 연동
│   ├── main.tsx
│   └── index.css
├── doc/
│   ├── setup/                # 단계별 구현 요약
│   └── dev/                  # 개발 가이드
├── index.html
├── package.json
├── tsconfig.json
└── vite.config.ts
```

---

*SQL-Tailor — SQL 내맘대로 정렬하기*
