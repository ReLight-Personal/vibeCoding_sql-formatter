import { SqlFormatter } from '../lib/sql-formatter'
import type { FormatRulesState } from '../types/formatRules'
import type { IndentType, CommaPosition, SqlDialect } from '../lib/sql-formatter/types/config'

export const DIALECT_LABEL: Record<SqlDialect, string> = {
  sql:         'Standard SQL',
  plsql:       'PL/SQL',
  mysql:       'MySQL',
  postgresql:  'PostgreSQL',
  transactsql: 'T-SQL',
  mybatis:     'MyBatis',
}

export interface FormatResult {
  sql: string
  detectedDialect: SqlDialect
  detectedDialectLabel: string
}

/** FormatRulesState → FormatOptions 변환 */
function buildFormatOptions(rules: FormatRulesState, detectedDialect?: SqlDialect) {
  return {
    dialect: 'sql' as const,
    tabWidth: rules.indentEnabled ? rules.tabWidth : 2,
    indentType: (
      rules.indentEnabled && rules.indentType === 'tabs'
        ? 'tabs'
        : 'spaces'
    ) as IndentType,
    keywordCase: rules.keywordCaseEnabled ? rules.keywordCase : ('preserve' as const),
    denseOperators: rules.operatorSpacingEnabled ? rules.denseOperators : false,
    commaPosition: (rules.commaPositionEnabled ? rules.commaPosition : 'trailing') as CommaPosition,
    // MyBatis 감지 시 templateType 자동 설정
    templateType: (detectedDialect === 'mybatis' ? 'mybatis' : 'none') as 'mybatis' | 'none',
    // Auto 들여쓰기 모드
    autoIndent: rules.indentEnabled && rules.indentType === 'auto',
  }
}

/** SQL 포매팅 + 방언 감지 */
export function formatWithRules(sql: string, rules: FormatRulesState): FormatResult {
  const formatter = new SqlFormatter()
  const detectedDialect = formatter.detectDialect(sql)
  const options = buildFormatOptions(rules, detectedDialect)
  const formattedSql = formatter.format(sql, options)

  return {
    sql: formattedSql,
    detectedDialect,
    detectedDialectLabel: DIALECT_LABEL[detectedDialect],
  }
}

/** 방언 감지만 수행 (포매팅 없음) — 입력 중 실시간 감지용 */
export function detectDialectOnly(sql: string): { dialect: SqlDialect; label: string } {
  const formatter = new SqlFormatter()
  const dialect = formatter.detectDialect(sql)
  return { dialect, label: DIALECT_LABEL[dialect] }
}
