# SQL Formatter Library

## 개요

외부 sql-formatter 라이브러리 의존성을 제거하고 자체 SQL 포매팅 엔진을 개발하는 프로젝트.
Tokenizer → Parser → Formatter 파이프라인 기반의 AST 방식으로 동작한다.

## 목표

- **독립성**: 외부 라이브러리 의존성 제거
- **확장성**: 다양한 SQL 방언 및 템플릿 엔진 지원
- **유연성**: 커스텀 포매팅 규칙
- **성능**: 대용량 SQL 처리 최적화

## 아키텍처

```
SqlTokenizer → SqlParser → SqlFormatter
     ↓              ↓            ↓
   토큰화    →    AST 생성  →  포매팅 출력
```

### 1. SqlTokenizer (`core/tokenizer.ts`)

SQL 문자열을 의미 단위의 토큰으로 분리한다.

**토큰 타입** (`types/token.ts`)

```typescript
type TokenType =
  | 'keyword'        // SELECT, WHERE, JOIN 등
  | 'identifier'     // 테이블명, 컬럼명, 백틱 식별자
  | 'operator'       // =, <>, !=, ::, ||, -> 등
  | 'string'         // 'text', "text"
  | 'number'         // 123, 45.67, 1e10
  | 'comment'        // -- line comment, /* block */
  | 'whitespace'     // 공백, 탭, 줄바꿈
  | 'semicolon'      // ;
  | 'comma'          // ,
  | 'parenthesis'    // ( )
  | 'bracket'        // [ ]
  | 'dot'            // .
  | 'mybatis_tag'    // <if>, <where>, <foreach> 등 MyBatis XML 태그
  | 'mybatis_param'  // #{param}, ${param} MyBatis 파라미터
  | 'placeholder'    // 내부 플레이스홀더 (MyBatis 처리용)
```

**주요 기능**
- 키워드 식별 (방언 공통 + 확장 키워드 포함)
- 문자열 리터럴 처리 (이스케이프, 연속 따옴표 `''`)
- 백틱 식별자 처리 (MySQL)
- 복합 연산자 우선 매칭 (`<=`, `>=`, `<>`, `::`, `||` 등)
- MyBatis `#{param}`, `${param}` 및 XML 태그 토큰화
- 연속 identifier 토큰 병합 후처리 (키워드 재판별 포함)

### 2. SqlParser (`core/parser.ts`)

토큰 스트림을 AST(Abstract Syntax Tree)로 변환한다.
공백 토큰을 사전 제거 후 파싱을 진행한다.

**AstNode 구조**

```typescript
interface AstNode {
  type: string        // 노드 타입 식별자
  tokens: SqlToken[]  // 해당 노드가 보유한 원본 토큰
  children?: AstNode[] // 자식 노드 (절/표현식 분리)
  value?: string
}
```

**지원하는 Statement 및 파싱 구조**

| Statement | 파싱 구조 |
|-----------|-----------|
| `SELECT` | select_modifier → select_columns → from_clause → join_clause(s) → where_clause → group_by_clause → having_clause → order_by_clause → limit_clause → set_operation(s) |
| `INSERT` | table_name → column_list → values_clause \| select_statement → returning_clause |
| `UPDATE` | table_name → set_clause → from_clause → where_clause → returning_clause |
| `DELETE` | table_name → using_clause → where_clause → returning_clause |
| `CREATE TABLE` | table_name → column_defs |
| `CREATE VIEW` | view_name → select_statement |
| `CTE (WITH)` | cte_definition(s) → main_statement |
| `PL/SQL DECLARE` | declare_var(s) → block_statement |
| `BEGIN...END` | statement(s) → exception_block |
| `UNION / INTERSECT / EXCEPT` | set_operation → select_statement |
| `서브쿼리` | subquery → select_statement (재귀 파싱) |

**JOIN 지원 타입**
- `INNER JOIN`, `LEFT [OUTER] JOIN`, `RIGHT [OUTER] JOIN`
- `FULL [OUTER] JOIN`, `CROSS JOIN`, `NATURAL JOIN`
- `ON` 조건 / `USING (컬럼)` 절

**조건식 파싱**
- `AND` / `OR` 기준으로 condition_group 분리
- 괄호 깊이(depth) 추적으로 서브쿼리 내부 키워드 오인식 방지

### 3. SqlFormatter (`core/formatter.ts`)

AST를 순회하며 설정에 따라 포매팅된 SQL 문자열을 생성한다.

**MyBatis 템플릿 처리** (`MyBatisTemplateHandler`)
- 포매팅 전 MyBatis 태그/파라미터를 플레이스홀더로 치환
- 포매팅 완료 후 원본 태그/파라미터로 복원
- `templateType: 'mybatis'` 옵션 또는 자동 감지로 활성화

## 지원하는 SQL 방언

### 1. Standard SQL (기본)
일반적인 ANSI SQL 문법을 기본으로 지원한다.

### 2. PL/SQL (Oracle)

```sql
DECLARE
  v_name VARCHAR2(100);
  v_count NUMBER := 0;
BEGIN
  SELECT name INTO v_name FROM users WHERE id = 1;
  IF v_count > 0 THEN
    UPDATE users SET grade = 'VIP' WHERE id = 1;
    COMMIT;
  END IF;
EXCEPTION
  WHEN NO_DATA_FOUND THEN
    ROLLBACK;
END;
```

지원 구조: DECLARE 블록, BEGIN...END, EXCEPTION...WHEN, CURSOR, LOOP

### 3. MySQL

```sql
SELECT id, name FROM users LIMIT 10 OFFSET 20;
```

지원 구문: LIMIT/OFFSET, 백틱 식별자, AUTO_INCREMENT, ENUM

### 4. PostgreSQL

```sql
SELECT id, name FROM users WHERE created_at > NOW()::date RETURNING id;
```

지원 구문: `::` 타입 캐스팅, ILIKE, RETURNING, SERIAL/BIGSERIAL

### 5. T-SQL (SQL Server)

```sql
SELECT TOP 10 id, name FROM users;
```

지원 구문: TOP, IDENTITY, NVARCHAR, GETDATE(), CONVERT()

## API 사용법

### 기본 사용

```typescript
import { SqlFormatter } from './core/formatter'

const formatter = new SqlFormatter({
  keywordCase: 'upper',
  indentType: 'spaces',
  tabWidth: 2,
  commaPosition: 'trailing',
})

const formatted = formatter.format('select id,name from users where active=1')
```

### 간편 함수 (`index.ts`)

```typescript
import { formatSql, formatPlSql, formatMySql, formatPostgreSql, formatTSql, formatMybatisSql } from './index'

// Standard SQL
formatSql('select id from users', { keywordCase: 'upper' })

// PL/SQL
formatPlSql('declare v_name varchar2(100); begin select name into v_name from users; end;')

// MySQL
formatMySql('select id from users limit 10', { indentType: 'tabs' })

// PostgreSQL
formatPostgreSql('select id from users where active = true returning id, name')

// T-SQL
formatTSql('select top 10 id, name from users')

// MyBatis XML 템플릿
formatMybatisSql(`
  select id, name from users
  <where>
    <if test="name != null">and name = #{name}</if>
  </where>
`)
```

### 방언 자동 감지

```typescript
const formatter = new SqlFormatter()
const dialect = formatter.detectDialect(sql)
// 반환값: 'plsql' | 'mysql' | 'postgresql' | 'transactsql' | 'sql'
```

### 유효성 검사

```typescript
const { isValid, errors } = formatter.validate(sql)
```

## 설정 옵션

### `FormatOptions` / `FormatterConfig`

```typescript
interface FormatterConfig {
  defaultDialect: SqlDialect           // 기본 방언 (기본: 'sql')
  maxLineLength: number                // 최대 줄 길이 (기본: 80)
  indentType: 'spaces' | 'tabs'        // 들여쓰기 방식 (기본: 'spaces')
  keywordCase: 'upper' | 'lower' | 'preserve'  // 키워드 케이스 (기본: 'upper')
  tabWidth: number                     // 스페이스 들여쓰기 너비 (기본: 2)
  commaPosition: 'leading' | 'trailing' // 콤마 위치 (기본: 'trailing')
  denseOperators: boolean              // 연산자 공백 제거 (기본: false)
  lineBreakStyle: 'unix' | 'windows'   // 줄바꿈 스타일 (기본: 'unix')
}

interface FormatOptions extends Partial<FormatterConfig> {
  dialect?: SqlDialect
  templateType?: 'none' | 'mybatis'   // 템플릿 엔진 타입
}
```

### 앱 연동 (`formatSql.ts`)

앱의 `FormatRulesState`를 라이브러리 옵션으로 변환하는 레이어.
`commaPosition`은 라이브러리 내부에서 단일 처리하므로 후처리 중복 적용 불필요.

```typescript
import { formatSql } from '../lib/sql-formatter'

function buildFormatOptions(rules: FormatRulesState): FormatOptions {
  return {
    dialect: 'sql',
    tabWidth: rules.indentEnabled ? rules.tabWidth : 2,
    indentType: rules.indentEnabled && rules.indentType === 'tabs' ? 'tabs' : 'spaces',
    keywordCase: rules.keywordCaseEnabled ? rules.keywordCase : 'preserve',
    denseOperators: rules.operatorSpacingEnabled ? rules.denseOperators : false,
    commaPosition: rules.commaPositionEnabled ? rules.commaPosition : 'trailing',
  }
}
```

## 현재 구현 상태

### ✅ 완료

- [x] 기본 토크나이저 (버그 수정, 복합 연산자, 백틱 식별자)
- [x] SELECT 문 파싱 및 포매팅
- [x] INSERT 문 파싱 및 포매팅 (VALUES 다중 행, INSERT INTO SELECT)
- [x] UPDATE 문 파싱 및 포매팅 (SET 절, PostgreSQL FROM 포함)
- [x] DELETE 문 파싱 및 포매팅 (USING, RETURNING 포함)
- [x] GROUP BY 절 파싱 및 포매팅
- [x] ORDER BY 절 파싱 및 포매팅
- [x] HAVING 절 파싱 및 포매팅
- [x] JOIN 파싱 및 포매팅 (INNER / LEFT / RIGHT / FULL / CROSS / NATURAL)
- [x] CTE (WITH 절) 파싱 및 포매팅
- [x] 서브쿼리 재귀 파싱 및 포매팅
- [x] UNION / INTERSECT / EXCEPT 처리
- [x] CREATE TABLE / VIEW 파싱 및 포매팅
- [x] PL/SQL DECLARE / BEGIN...END / EXCEPTION 블록
- [x] MyBatis XML 템플릿 지원 (태그 추출 → 복원)
- [x] 키워드 대소문자 변환 (upper / lower / preserve)
- [x] 들여쓰기 제어 (spaces / tabs, 너비 설정)
- [x] 콤마 위치 제어 (leading / trailing) — 라이브러리 내부 단일 처리
- [x] 연산자 공백 제어 (denseOperators)
- [x] 줄바꿈 스타일 (unix / windows)
- [x] SQL 방언 자동 감지
- [x] 유효성 검사 (`validate()`)
- [x] 간편 함수 (`formatSql`, `formatPlSql`, `formatMySql`, `formatPostgreSql`, `formatTSql`, `formatMybatisSql`)

### ⏳ 예정

- [ ] LIMIT / FETCH NEXT 방언별 처리 (PostgreSQL `FETCH NEXT n ROWS ONLY`)
- [ ] MERGE 문 구조화 파싱
- [ ] ALTER / DROP 구조화 파싱
- [ ] Window 함수 포매팅 (`OVER (PARTITION BY ... ORDER BY ...)`)
- [ ] CASE WHEN 표현식 멀티라인 포매팅
- [ ] 단위 테스트 완성
- [ ] 성능 최적화 (대용량 SQL)

## 파일 구조

```
sql-formatter/
├── index.ts                  # 진입점, 간편 함수 export
├── README.md
├── core/
│   ├── tokenizer.ts          # SqlTokenizer
│   ├── parser.ts             # SqlParser
│   └── formatter.ts          # SqlFormatter + MyBatisTemplateHandler
└── types/
    ├── config.ts             # FormatterConfig, FormatOptions
    └── token.ts              # SqlToken, TokenType
```

## 빌드 및 배포

```bash
npm run build    # TypeScript 컴파일 + Vite 빌드
npm run dev      # 개발 서버
```

---

*마지막 업데이트: 2026-03-06*
