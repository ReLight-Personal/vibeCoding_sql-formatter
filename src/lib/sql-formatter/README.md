# SQL Formatter Library

## 개요

외부 sql-formatter 라이브러리 의존성을 제거하고 자체 SQL 포매팅 엔진을 개발하는 프로젝트.
Tokenizer → Parser → Formatter 파이프라인 기반의 AST 방식으로 동작한다.

## 목표

- **독립성**: 외부 라이브러리 의존성 제거
- **확장성**: 다양한 SQL 방언 및 템플릿 엔진 지원
- **유연성**: 커스텀 포매팅 규칙 (Auto 들여쓰기 포함)
- **성능**: 대용량 SQL 처리 최적화

## 아키텍처

```
SqlTokenizer → SqlParser → SqlFormatter
     ↓              ↓            ↓
   토큰화    →    AST 생성  →  포매팅 출력
                                   ↓
                          (indentType: 'auto')
                                   ↓
                        autoIndentFormatter
                        (키워드 정렬 후처리)
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
- 포매팅 전 MyBatis 태그/파라미터를 플레이스홀더로 치환 후 복원
- `<![CDATA[...]]>` 섹션 보존: open/close를 각각 별도 플레이스홀더로 관리
- `<where>` / `<set>` 태그: sentinel 키워드 삽입으로 파서가 WHERE/SET 절을 올바르게 인식
- `templateType: 'mybatis'` 옵션 또는 자동 감지로 활성화

### 4. AutoIndentFormatter (`core/autoIndentFormatter.ts`)

`indentType: 'auto'` 선택 시 SqlFormatter 기본 출력에 추가 적용되는 후처리 엔진.

**동작 방식**
1. 기본 포매터(SqlFormatter)가 표준 들여쓰기로 SQL 출력
2. `applyAutoIndent()`가 출력을 받아 Auto 규칙 적용
3. 서브쿼리는 플레이스홀더로 추출 후 재귀 처리, 복원 시 `(` 다음 위치 정렬

**적용 규칙 (Rule 1~4)**

| Rule | 설명 |
|------|------|
| Rule 1 | SQL 키워드(`SELECT`, `FROM`, `WHERE`, `AND` 등)마다 줄바꿈 |
| Rule 2 | 사용된 키워드 중 가장 긴 것 기준으로 나머지 키워드 앞에 우측 정렬 패딩 |
| Rule 3 | 키워드 뒤 첫 번째 내용은 줄바꿈 없이 2칸 공백으로 연결 |
| Rule 4 | 서브쿼리는 `(` 바로 다음 위치를 기준열로 삼아 내부 키워드 정렬 |

**출력 예시**

```sql
-- 입력
select O_CD, (select s.K_D_NM from HDT s where s.D_CD = a.W_CD) as W_NM
from MDT a where a.PT = '02459026' and a.O_YMD = '2026-03-13'

-- Auto 들여쓰기 출력 (keywords: SELECT=6, FROM=4, WHERE=5, AND=3)
SELECT  O_CD
        , (SELECT  s.K_D_NM
             FROM  HDT s
            WHERE  s.D_CD = a.W_CD
          )  as W_NM
  FROM  MDT a
 WHERE  a.PT = '02459026'
   AND  a.O_YMD = '2026-03-13'
```

**대상 키워드 목록**

```
SELECT, FROM, WHERE, AND, OR, ON, HAVING, LIMIT, OFFSET,
ORDER BY, GROUP BY, INSERT INTO, DELETE FROM, UPDATE, SET, VALUES,
LEFT JOIN, RIGHT JOIN, INNER JOIN, LEFT OUTER JOIN, RIGHT OUTER JOIN,
FULL OUTER JOIN, CROSS JOIN, UNION, UNION ALL, INTERSECT, EXCEPT
```

## 지원하는 SQL 방언

### 0. MyBatis XML 템플릿 (자동 감지 우선)

```sql
/*SQL_ID: com.example.UserDAO.findUser*/
<![CDATA[
  SELECT u.id, u.name
  FROM   users u
  <where>
    <if test="name != null">AND u.name = #{name}</if>
    <if test="status != null">AND u.status = #{status}</if>
  </where>
  ORDER BY u.id
]]>
```

감지 조건: `#{param}`, `${param}`, MyBatis XML 태그(`<if>`, `<where>`, `<foreach>` 등), `<![CDATA[`

### 1. Standard SQL (기본)

일반적인 ANSI SQL 문법을 기본으로 지원한다.

### 2. PL/SQL (Oracle)

```sql
DECLARE
  v_name VARCHAR2(100);
BEGIN
  SELECT name INTO v_name FROM users WHERE id = 1;
EXCEPTION
  WHEN NO_DATA_FOUND THEN
    ROLLBACK;
END;
```

### 3. MySQL

```sql
SELECT id, name FROM users LIMIT 10 OFFSET 20;
```

### 4. PostgreSQL

```sql
SELECT id, name FROM users WHERE created_at > NOW()::date RETURNING id;
```

### 5. T-SQL (SQL Server)

```sql
SELECT TOP 10 id, name FROM users;
```

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

### Auto 들여쓰기 사용

```typescript
import { applyAutoIndent } from './core/autoIndentFormatter'

// SqlFormatter로 기본 포매팅 후 Auto 후처리
const base = formatter.format(sql, { indentType: 'spaces' })
const auto = applyAutoIndent(base, { keywordCase: 'upper', ... })
```

### 간편 함수 (`index.ts`)

```typescript
import { formatSql, formatPlSql, formatMySql, formatPostgreSql, formatTSql, formatMybatisSql } from './index'
```

### 방언 자동 감지

```typescript
const formatter = new SqlFormatter()
const dialect = formatter.detectDialect(sql)
// 반환값: 'mybatis' | 'plsql' | 'mysql' | 'postgresql' | 'transactsql' | 'sql'
```

### 유효성 검사

```typescript
const { isValid, errors } = formatter.validate(sql)
```

## 설정 옵션

### `FormatterConfig`

```typescript
interface FormatterConfig {
  defaultDialect: SqlDialect
  maxLineLength: number
  indentType: 'spaces' | 'tabs' | 'auto'  // 'auto' 추가
  keywordCase: 'upper' | 'lower' | 'preserve'
  tabWidth: number
  commaPosition: 'leading' | 'trailing'
  denseOperators: boolean
  lineBreakStyle: 'unix' | 'windows'
}
```

> `indentType: 'auto'`는 `formatSql.ts` 레이어에서 처리.
> 내부적으로 `'spaces'`로 기본 포매팅 후 `applyAutoIndent()` 후처리.

## 구현 상태

### ✅ 완료

- [x] 기본 토크나이저 (복합 연산자, 백틱 식별자)
- [x] SELECT / INSERT / UPDATE / DELETE 파싱 및 포매팅
- [x] GROUP BY / ORDER BY / HAVING / LIMIT 절
- [x] JOIN (INNER / LEFT / RIGHT / FULL / CROSS / NATURAL)
- [x] CTE (WITH 절), 서브쿼리 재귀 파싱
- [x] UNION / INTERSECT / EXCEPT
- [x] CREATE TABLE / VIEW
- [x] PL/SQL DECLARE / BEGIN...END / EXCEPTION 블록
- [x] MyBatis XML 템플릿 (CDATA 보존, sentinel 키워드)
- [x] 키워드 대소문자 변환 (upper / lower / preserve)
- [x] 들여쓰기 제어 (spaces / tabs / **auto**)
- [x] 콤마 위치 제어 (leading / trailing)
- [x] 연산자 공백 제어 (denseOperators)
- [x] **Auto 들여쓰기** (Rule 1~4, 서브쿼리 재귀 정렬)
- [x] SQL 방언 자동 감지 및 유효성 검사

### ⏳ 예정

- [ ] LIMIT / FETCH NEXT 방언별 처리
- [ ] MERGE 문 구조화 파싱
- [ ] ALTER / DROP 구조화 파싱
- [ ] Window 함수 포매팅 (`OVER (PARTITION BY ... ORDER BY ...)`)
- [ ] CASE WHEN 표현식 멀티라인 포매팅
- [ ] 단위 테스트

## 파일 구조

```
sql-formatter/
├── index.ts                      # 진입점, 간편 함수 export
├── README.md
├── core/
│   ├── tokenizer.ts              # SqlTokenizer
│   ├── parser.ts                 # SqlParser
│   ├── formatter.ts              # SqlFormatter + MyBatisTemplateHandler
│   └── autoIndentFormatter.ts    # Auto 들여쓰기 후처리 엔진 ← 신규
└── types/
    ├── config.ts                 # FormatterConfig, FormatOptions (IndentType에 'auto' 추가)
    └── token.ts                  # SqlToken, TokenType
```

---

*마지막 업데이트: 2026-03-17*
