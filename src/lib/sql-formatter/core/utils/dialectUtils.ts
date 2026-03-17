/**
 * dialectUtils.ts
 * ─────────────────────────────────────────────────
 * SQL 방언 감지 및 키워드 데이터
 *
 * - SQL_KEYWORDS : tokenizer의 keyword/identifier 판별에 사용
 * - detectDialect: SQL 문자열을 분석해 방언을 추론
 *
 * tokenizer.ts(keywords Set) + formatter.ts(detectDialect)에서 분리.
 */

import type { SqlDialect } from '../../types/config'

// ─────────────────────────────────────────────────
// SQL 키워드 세트 (방언 공통 + 확장)
//
// tokenizer가 identifier와 keyword를 구분하는 기준.
// ─────────────────────────────────────────────────
export const SQL_KEYWORDS = new Set([
  // DDL
  'CREATE', 'ALTER', 'DROP', 'TRUNCATE', 'RENAME', 'TABLE', 'VIEW',
  'INDEX', 'SEQUENCE', 'PROCEDURE', 'FUNCTION', 'TRIGGER', 'PACKAGE',
  'DATABASE', 'SCHEMA', 'TABLESPACE', 'COLUMN', 'CONSTRAINT',
  'PRIMARY', 'FOREIGN', 'KEY', 'REFERENCES', 'UNIQUE', 'CHECK',
  'DEFAULT', 'TEMPORARY', 'TEMP', 'IF', 'EXISTS',
  // DML
  'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'MERGE', 'REPLACE',
  'INTO', 'VALUES', 'SET', 'FROM', 'WHERE', 'GROUP', 'HAVING',
  'ORDER', 'BY', 'LIMIT', 'OFFSET', 'FETCH', 'NEXT', 'ROWS', 'ONLY',
  'RETURNING',
  // JOIN
  'JOIN', 'INNER', 'LEFT', 'RIGHT', 'FULL', 'OUTER', 'CROSS',
  'NATURAL', 'ON', 'USING',
  // 집합 연산
  'UNION', 'INTERSECT', 'EXCEPT', 'ALL',
  // CTE
  'WITH', 'RECURSIVE', 'AS',
  // DCL
  'GRANT', 'REVOKE', 'COMMIT', 'ROLLBACK', 'SAVEPOINT', 'BEGIN',
  'TRANSACTION', 'START',
  // 집계
  'COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'DISTINCT', 'OVER',
  'PARTITION', 'ROWS', 'RANGE', 'PRECEDING', 'FOLLOWING', 'UNBOUNDED',
  'CURRENT', 'ROW',
  // 조건
  'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'COALESCE', 'NULLIF',
  'IIF', 'DECODE',
  // 데이터 타입
  'NULL', 'TRUE', 'FALSE', 'NOT', 'UNKNOWN',
  // 논리
  'AND', 'OR', 'NOT', 'IN', 'EXISTS', 'BETWEEN', 'LIKE', 'ILIKE',
  'IS', 'ANY', 'SOME', 'ALL',
  // PL/SQL
  'DECLARE', 'BEGIN', 'END', 'EXCEPTION', 'RAISE', 'LOOP',
  'WHILE', 'FOR', 'CURSOR', 'OPEN', 'CLOSE', 'FETCH', 'EXIT',
  'CONTINUE', 'RETURN', 'GOTO', 'TYPE', 'RECORD', 'ROWTYPE',
  // T-SQL
  'TOP', 'IDENTITY', 'SCOPE_IDENTITY', 'OUTPUT', 'EXEC', 'EXECUTE',
  'PRINT', 'GO', 'USE', 'NOCOUNT', 'NOLOCK', 'UPDLOCK',
  // MySQL
  'AUTO_INCREMENT', 'UNSIGNED', 'ZEROFILL', 'ENUM', 'SHOW',
  'DESCRIBE', 'EXPLAIN', 'ENGINE', 'CHARSET',
  // PostgreSQL
  'SERIAL', 'BIGSERIAL', 'RETURNING', 'ILIKE', 'SIMILAR',
  'EXCLUDE', 'DO', 'LANGUAGE', 'PLPGSQL',
])

// ─────────────────────────────────────────────────
// 방언 감지
// ─────────────────────────────────────────────────

/**
 * SQL 문자열의 특징적인 구문을 분석해 방언을 추론한다.
 * 판별 우선순위: mybatis → plsql → mysql → postgresql → transactsql → sql
 */
export function detectDialect(sql: string): SqlDialect {
  const up = sql.toUpperCase()
  // MyBatis: #{...}, ${...} 파라미터 또는 MyBatis XML 태그 또는 CDATA 래퍼
  if (/[#$]\{[^}]*\}|<(?:if|where|set|foreach|choose|when|otherwise|trim|bind)\b|<!\[CDATA\[/i.test(sql)) return 'mybatis'
  if (/\b(DECLARE|BEGIN|END|PROCEDURE|FUNCTION|PACKAGE|TRIGGER|CURSOR|EXCEPTION)\b/.test(up)) return 'plsql'
  if (/\b(LIMIT|AUTO_INCREMENT|TINYINT|ENUM|SHOW|DESCRIBE)\b/.test(up)) return 'mysql'
  if (/\b(SERIAL|BIGSERIAL|BYTEA|JSONB|ARRAY|ILIKE|EXCLUDE)\b/.test(up)) return 'postgresql'
  if (/\b(TOP|IDENTITY|NVARCHAR|GETDATE\(\)|CONVERT\()/.test(up)) return 'transactsql'
  return 'sql'
}