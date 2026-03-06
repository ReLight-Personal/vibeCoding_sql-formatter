import { formatSql, SqlFormatter } from '../lib/sql-formatter'
import type { FormatRulesState } from '../types/formatRules'
import type { IndentType, CommaPosition, SqlDialect } from '../lib/sql-formatter/types/config'

const DIALECT_LABEL: Record<SqlDialect, string> = {
  sql:         'Standard SQL',
  plsql:       'PL/SQL',
  mysql:       'MySQL',
  postgresql:  'PostgreSQL',
  transactsql: 'T-SQL',
}

export interface FormatResult {
  sql: string
  detectedDialect: SqlDialect
  detectedDialectLabel: string
}

/** sql-formatter에 넘길 옵션 (활성화된 규칙만 반영) */
function buildFormatOptions(rules: FormatRulesState) {
  return {
    dialect: 'sql' as const,
    tabWidth: rules.indentEnabled ? rules.tabWidth : 2,
    indentType: (rules.indentEnabled && rules.indentType === 'tabs' ? 'tabs' : 'spaces') as IndentType,
    keywordCase: rules.keywordCaseEnabled ? rules.keywordCase : ('preserve' as const),
    denseOperators: rules.operatorSpacingEnabled ? rules.denseOperators : false,
    commaPosition: (rules.commaPositionEnabled ? rules.commaPosition : 'trailing') as CommaPosition,
  }
}

/** 현재 규칙에 따라 SQL 포매팅 */
export function formatWithRules(sql: string, rules: FormatRulesState): FormatResult {
  const options = buildFormatOptions(rules)
  const formatter = new SqlFormatter(options)

  const detectedDialect = formatter.detectDialect(sql)
  const formattedSql = formatter.format(sql, options)

  return {
    sql: formattedSql,
    detectedDialect,
    detectedDialectLabel: DIALECT_LABEL[detectedDialect],
  }
}
