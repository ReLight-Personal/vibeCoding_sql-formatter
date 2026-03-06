# SQL-Tailor 문서

## 실행 방법

```bash
# 의존성 설치
npm install

# 개발 서버 실행 (Hot reload)
npm run dev

# 프로덕션 빌드
npm run build

# 빌드 결과물 로컬 미리보기
npm run preview
```

## 기술 스택
- React 18, TypeScript
- Vite (빌드·개발 서버)
- 자체 SQL 포매팅 엔진 (`src/lib/sql-formatter`)

## 폴더 구성

| 폴더 | 설명 |
|------|------|
| **setup/** | 초기셋팅 단계별 구현 요약 문서 |
| **dev/** | 개발 중 작업내용 요약 문서 |

## setup — 초기셋팅 단계별 구현 요약
- [01-1단계-구현요약.md](setup/01-1단계-구현요약.md) — 기초 레이아웃, Core 포매팅, 배너
- [02-2단계-구현요약.md](setup/02-2단계-구현요약.md) — 규칙 제어 패널, 상태 관리, 실시간 반영
- [03-3단계-구현요약.md](setup/03-3단계-구현요약.md) — 사용자 정의 템플릿(Regex/Replace), LocalStorage 저장
- [04-4단계-구현요약.md](setup/04-4단계-구현요약.md) — AI 연동(OpenAI/Anthropic), API Key, 미리보기·적용 UX

## dev — 개발 중 작업내용 요약
- [20260227.01.md](dev/20260227.01-shadcn-ui-적용정리.md) — Cursor AI를 통한 shadcn/ui 적용
- [20260304.01.md](dev/20260304.01-BANNER_IMPROVEMENTS.md) — Windsurf AI를 통한 Banner 컴포넌트 브라우저 크기에 맞춰 동적으로 상단에 고정
- [20260304.02.md](dev/20260304.02-Banner-컴포넌트-개선.md) — Windsurf AI를 통한 Banner 컴포넌트 숨기기/보이기 기능을 개선하고, 향후 좌우 배치 확장
- [20260304.03.md](dev/20260304.03-Sidebar_컴포넌트_분리_및_반응형_기능_개선.md) — Windsurf AI를 통한 Sidebar 컴포넌트 분리 및 반응형 기능 개선
- [20260304.04.md](dev/20260304.04-CSS-리팩토링-완료.md) — Windsurf AI를 통한 CSS 리팩토링 완료
- [20260304.05.md](dev/20260304.05-Sidebar-컴포넌트-개선.md) — Windsurf AI를 통한 Sidebar 컴포넌트 개선
- [20260305.01.md](dev/20260305.01-sql-formatter-development.md) — Windsurf AI를 통한 자체 SQL 포매터 엔진 초기 개발
- [20260306.01.md](dev/20260306.01-custom-formatter-migration.md) — Claude AI를 통한 외부 라이브러리 → 자체 엔진 마이그레이션
- [20260306.02.md](dev/20260306.02-sql-formatter-engine-upgrade.md) — Claude AI를 통한 엔진 전면 업그레이드 (파서·포매터 완성, 방언 배지 UI)
- [20260306.03.md](dev/20260306.03-realtime-dialect-detection.md) — Claude AI를 통한 실시간 방언 감지 및 App 로직 정리
- [20260306.04.md](dev/20260306.04-mybatis-engine-fix.md) — Claude AI를 통한 MyBatis 엔진 대응 (CDATA 처리, 한 줄 출력 버그 수정)