# SQL Formatter Library

## 개요

sql-formatter 라이브러리의 의존성을 제거하고 자체 SQL 포매팅 엔진을 개발하는 프로젝트

## 목표

- **독립성**: 외부 라이브러리 의존성 제거
- **확장성**: 다양한 SQL 방언 지원
- **유연성**: 커스텀 포매팅 규칙
- **성능**: 대용량 SQL 처리 최적화

## 아키텍처

### 핵심 컴포넌트

```
SqlTokenizer → SqlParser → SqlFormatter
    ↓            ↓           ↓
  토큰화     →   AST   →  포매팅
```

#### 1. SqlTokenizer (tokenizer.ts)
SQL 문장을 의미 있는 토큰 단위로 분리

**주요 기능**
- 키워드 식별 (SELECT, INSERT, UPDATE 등)
- 리터럴 처리 (문자열, 숫자)
- 연산자 및 구분자 인식
- 주석 처리 (`--`, `/* */`)

**토큰 타입**
```typescript
type TokenType = 
  | 'keyword'      // SELECT, WHERE 등
  | 'identifier'   // 테이블명, 컬럼명
  | 'operator'    // =, <>, +, -, *, /
  | 'string'       // 'text', "text"
  | 'number'       // 123, 45.67
  | 'comment'      // -- comment, /* comment */
  | 'whitespace'   // 공백, 탭, 줄바꿈
  | 'semicolon'    // ;
  | 'comma'       // ,
  | 'parenthesis'  // (, )
  | 'bracket'     // [, ]
  | 'dot'         // .
```

#### 2. SqlParser (parser.ts)
토큰을 AST(Abstract Syntax Tree)로 변환

**주요 노드 타입**
```typescript
interface AstNode {
  type: string           // 'select_statement', 'from_clause' 등
  tokens: SqlToken[]    // 원본 토큰
  children?: AstNode[]   // 자식 노드
}
```

**파싱 규칙**
- **SELECT 문**: select_clause → from_clause → where_clause → group_by → order_by
- **INSERT 문**: insert_into → values
- **UPDATE 문**: update → set → where
- **DELETE 문**: delete_from → where
- **DDL 문**: create/alter/drop

#### 3. SqlFormatter (formatter.ts)
AST를 기반으로 SQL 포매팅 적용

**포매팅 규칙**
- **키워드 대소문자**: upper/lower/preserve
- **들여쓰기**: spaces/tabs, 너비 설정
- **콤마 위치**: leading/trailing
- **연산자 공백**: dense/normal
- **줄 길이**: 최대 길이 제한

## 지원하는 SQL 방언

### 1. Standard SQL (기본)
- 대부분의 기본 SQL 문법 지원
- 호환성이 가장 높은 기본 설정

### 2. PL/SQL (Oracle)
```sql
DECLARE
  v_name VARCHAR2(100);
BEGIN
  SELECT name INTO v_name FROM users WHERE id = 1;
END;
```

**특징**
- 블록 구조: DECLARE-BEGIN-END
- 제어문: IF-THEN-ELSE, LOOP
- 예외 처리: EXCEPTION-WHEN
- 커서: CURSOR, OPEN, FETCH

### 3. MySQL
```sql
SELECT id, name FROM users LIMIT 10 OFFSET 20;
```

**특징**
- LIMIT 구문
- AUTO_INCREMENT 데이터 타입
- ENUM, SET 타입
- 백틱(``) 식별자

### 4. PostgreSQL
```sql
SELECT id, name FROM users WHERE created_at > NOW()::date;
```

**특징**
- SERIAL, BIGSERIAL 타입
- JSONB, ARRAY 타입
- ILIKE 연산자
- 타입 캐스팅 (::)

### 5. T-SQL (SQL Server)
```sql
SELECT TOP 10 id, name FROM users WHERE id = SCOPE_IDENTITY();
```

**특징**
- TOP 구문
- IDENTITY, SCOPE_IDENTITY()
- GETDATE(), CONVERT() 함수
- NVARCHAR 타입

## API 사용법

### 기본 사용
```typescript
import { SqlFormatter } from './core/formatter'

const formatter = new SqlFormatter({
  keywordCase: 'upper',
  indentType: 'spaces',
  tabWidth: 2,
  commaPosition: 'trailing'
})

const formatted = formatter.format('select id,name from users where active=1')
```

### 간편 함수
```typescript
import { formatSql, formatPlSql, formatMySql } from './index'

// 기본 SQL
formatSql('select id from users', { keywordCase: 'upper' })

// PL/SQL
formatPlSql('declare v_name varchar2(100); begin select name into v_name from users; end;')

// MySQL
formatMySql('select id from users limit 10', { indentType: 'tabs' })
```

### 방언 자동 감지
```typescript
const formatter = new SqlFormatter()
const dialect = formatter.detectDialect(sql) // 'plsql' | 'mysql' | 'postgresql' | 'transactsql' | 'sql'
```

## 설정 옵션

### FormatterConfig
```typescript
interface FormatterConfig {
  defaultDialect: SqlDialect      // 기본 방언
  maxLineLength: number           // 최대 줄 길이 (기본: 80)
  indentType: IndentType          // 들여쓰기 방식 (spaces/tabs)
  keywordCase: KeywordCase        // 키워드 대소문자 (upper/lower/preserve)
  tabWidth: number               // 탭 너비 (기본: 2)
  commaPosition: CommaPosition    // 콤마 위치 (leading/trailing)
  denseOperators: boolean         // 연산자 공백 제거 (기본: false)
  lineBreakStyle: 'unix' | 'windows'  // 줄바꿈 스타일
}
```

## 확장 포인트

### 1. 새로운 방언 추가
```typescript
// dialects/newsql.ts
export class NewSqlDialect extends SqlDialect {
  name = 'newsql'
  keywords = ['CUSTOM_KEYWORD', ...]
  // 방언별 파싱 로직 구현
}
```

### 2. 커스텀 포매팅 규칙
```typescript
// rules/custom-formatting.ts
export class CustomFormattingRule implements FormattingRule {
  name = 'custom-rule'
  apply(node: AstNode, context: FormatContext): void {
    // 커스텀 포매팅 로직
  }
}
```

### 3. 템플릿 엔진 확장
```typescript
// templates/custom-template.ts
export class CustomTemplateParser implements TemplateParser {
  extractSql(template: string): ExtractedSql {
    // 템플릿에서 SQL 추출
  }
  
  restoreTemplate(sql: string, template: string): string {
    // 포매팅된 SQL을 템플릿으로 복원
  }
}
```

## 현재 구현 상태

### ✅ 완료
- [x] 기본 토크나이저
- [x] SELECT 문 파싱
- [x] 키워드 대소문자 변환
- [x] 기본 들여쓰기 처리
- [x] 콤마 위치 제어
- [x] SQL 방언 감지
- [x] 기존 시스템 연동

### 🚧 진행 중
- [ ] GROUP BY 절 포매팅
- [ ] ORDER BY 절 포매팅
- [ ] JOIN 문법 처리
- [ ] PL/SQL 블록 구조

### ⏳ 예정
- [ ] MyBatis XML 템플릿 지원
- [ ] 복잡한 서브쿼리 처리
- [ ] INSERT/UPDATE/DELETE 문법 완성
- [ ] 성능 최적화
- [ ] 단위 테스트 완성

## 테스트

### 테스트 케이스 구조
```typescript
const testCases = [
  {
    name: '기본 SELECT 문',
    input: 'select id, name from users where active = 1',
    expected: 'SELECT\n  id,\n  name\nFROM\n  users\nWHERE\n  active = 1'
  },
  {
    name: 'PL/SQL 블록',
    input: 'declare v_name varchar2(100); begin select name into v_name from users; end;',
    expected: 'DECLARE\n  v_name VARCHAR2(100);\nBEGIN\n  SELECT\n    name\n  INTO\n    v_name\n  FROM\n    users;\nEND;'
  }
]
```

### 실행 방법
```bash
# 테스트 파일 실행
node -r ts-node src/utils/test-custom-formatter.ts

# 또는 앱 내에서 테스트
npm run dev
```

## 빌드 및 배포

### 개발 빌드
```bash
npm run build    # TypeScript 컴파일 + Vite 빌드
npm run dev      # 개발 서버
```

### 라이브러리 빌드 (향후)
```bash
# 독립 라이브러리로 빌드
npm run build:lib

# 패키지 게시
npm publish
```

## 기여 가이드

### 코드 스타일
- TypeScript 엄격 모드 사용
- 함수형 프로그래밍 선호
- 명확한 변수명 사용
- 적절한 주석 작성

### 커밋 규칙
- feat: 새로운 기능
- fix: 버그 수정
- docs: 문서 업데이트
- refactor: 리팩토링

### PR 프로세스
1. 기능 브랜치 생성
2. 테스트 케이스 추가
3. 코드 구현
4. 테스트 통과 확인
5. Pull Request 생성

---

*마지막 업데이트: 2025-03-05*
