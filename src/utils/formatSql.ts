//import { format } from 'sql-formatter'
import { formatSql } from '../lib/sql-formatter'
import type { FormatRulesState } from '../types/formatRules'
import type { IndentType, CommaPosition } from '../lib/sql-formatter/types/config'

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

/** 변경 전 buildFormatOptions 로직 (외부 sql-formatter 라이브러리용)
function buildFormatOptions(rules: FormatRulesState) {
  return {
    language: 'sql' as const,
    tabWidth: rules.indentEnabled ? rules.tabWidth : 2,
    useTabs: rules.indentEnabled && rules.indentType === 'tabs',
    keywordCase: rules.keywordCaseEnabled ? rules.keywordCase : ('preserve' as const),
    denseOperators: rules.operatorSpacingEnabled ? rules.denseOperators : false,
  }
}
*/

/** 콤마를 줄 끝(trailing) → 줄 앞(leading)으로 변환 */
function applyCommaLeading(sql: string, indent: string): string {
  return sql
    .split('\n')
    .reduce<string[]>((acc, line) => {
      const trimmed = line.trimEnd()
      if (trimmed.endsWith(',')) {
        acc.push(trimmed.slice(0, -1))
        acc.push(indent + ',')
      } else {
        acc.push(line)
      }
      return acc
    }, [])
    .join('\n')
}

/** 현재 규칙에 따라 SQL 포매팅 (콤마 위치는 후처리) */
export function formatWithRules(sql: string, rules: FormatRulesState): string {
  const options = buildFormatOptions(rules)

  //let result = format(sql, options)
  let result = formatSql(sql, options)

  if (rules.commaPositionEnabled && rules.commaPosition === 'leading') {
    const indentStr = rules.indentType === 'tabs' ? '\t' : ' '.repeat(rules.tabWidth)
    result = applyCommaLeading(result, indentStr)
  }

  return result
}
