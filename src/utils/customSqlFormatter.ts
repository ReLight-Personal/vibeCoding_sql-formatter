import { SqlFormatter, formatSql } from '../lib/sql-formatter'
import type { FormatRulesState } from '../types/formatRules'

// 기존 FormatRulesState를 새로운 FormatterConfig로 변환
function convertRulesToConfig(rules: FormatRulesState) {
  return {
    defaultDialect: 'sql' as const,
    maxLineLength: 80,
    indentType: rules.indentEnabled ? rules.indentType : 'spaces',
    keywordCase: rules.keywordCaseEnabled ? rules.keywordCase : 'preserve',
    tabWidth: rules.tabWidth,
    commaPosition: rules.commaPositionEnabled ? rules.commaPosition : 'trailing',
    denseOperators: rules.operatorSpacingEnabled ? rules.denseOperators : false,
    lineBreakStyle: 'unix' as const,
  }
}

// 기존 API 호환성을 위한 래퍼 함수
export function formatWithRules(sql: string, rules: FormatRulesState): string {
  try {
    const config = convertRulesToConfig(rules)
    const formatter = new SqlFormatter(config)
    return formatter.format(sql)
  } catch (error) {
    console.warn('Custom SQL 포매터 실패, 원본 반환:', error)
    return sql
  }
}

// 새로운 기능들
export function formatPlSql(sql: string, rules: FormatRulesState): string {
  try {
    const config = convertRulesToConfig(rules)
    const formatter = new SqlFormatter(config)
    return formatter.format(sql, { dialect: 'plsql' })
  } catch (error) {
    console.warn('PL/SQL 포매팅 실패, 원본 반환:', error)
    return sql
  }
}

export function formatMySql(sql: string, rules: FormatRulesState): string {
  try {
    const config = convertRulesToConfig(rules)
    const formatter = new SqlFormatter(config)
    return formatter.format(sql, { dialect: 'mysql' })
  } catch (error) {
    console.warn('MySQL 포매팅 실패, 원본 반환:', error)
    return sql
  }
}

// 간편 함수
export { formatSql }
