/**
 * subqueryUtils.ts
 * ─────────────────────────────────────────────────
 * 서브쿼리 처리 유틸리티
 * 
 * autoIndentFormatter.ts와 formatter.ts가 공유하는 서브쿼리 처리 로직
 */

import type { FormatterConfig } from '../../types/config'

// ─────────────────────────────────────────────────
// SQL 함수명 목록 (alias 오탐 방지용)
// 서브쿼리 바로 뒤에 이 이름이 오더라도 alias로 취급하지 않음
// ─────────────────────────────────────────────────
export const SQL_FUNCTION_KEYWORDS: string[] = [
  // Oracle 전용
  'DECODE', 'NVL', 'NVL2',
  // 표준 SQL / 공통
  'COALESCE', 'NULLIF', 'IIF',
  'CASE', 'WHEN', 'THEN', 'ELSE', 'END',
  // 문자열
  'CONCAT', 'SUBSTR', 'SUBSTRING', 'LENGTH', 'TRIM', 'LTRIM', 'RTRIM',
  'UPPER', 'LOWER', 'REPLACE', 'INSTR', 'LPAD', 'RPAD', 'TO_CHAR',
  // 숫자
  'ROUND', 'TRUNC', 'FLOOR', 'CEIL', 'CEILING', 'MOD', 'ABS', 'SIGN',
  'POWER', 'SQRT', 'TO_NUMBER',
  // 날짜
  'TO_DATE', 'SYSDATE', 'NOW', 'CURRENT_DATE', 'CURRENT_TIMESTAMP',
  'DATEADD', 'DATEDIFF', 'DATE_FORMAT', 'EXTRACT',
  // 집계 / 윈도우
  'COUNT', 'SUM', 'AVG', 'MIN', 'MAX',
  'ROW_NUMBER', 'RANK', 'DENSE_RANK', 'NTILE',
  'LAG', 'LEAD', 'FIRST_VALUE', 'LAST_VALUE',
  // 형변환
  'CAST', 'CONVERT',
  // 기타
  'ISNULL', 'IFNULL', 'GREATEST', 'LEAST',
]

// ─────────────────────────────────────────────────
// Auto 포매팅 대상 절 키워드 목록 (alias 체크용)
// ─────────────────────────────────────────────────
export const AUTO_CLAUSE_KEYWORDS: string[] = [
  'INSERT INTO',
  'DELETE FROM',
  'ORDER BY',
  'GROUP BY',
  'LEFT OUTER JOIN',
  'RIGHT OUTER JOIN',
  'FULL OUTER JOIN',
  'CROSS JOIN',
  'LEFT JOIN',
  'RIGHT JOIN',
  'INNER JOIN',
  'UNION ALL',
  'SELECT',
  'UPDATE',
  'DELETE',
  'INSERT',
  'FROM',
  'WHERE',
  'HAVING',
  'LIMIT',
  'OFFSET',
  'UNION',
  'INTERSECT',
  'EXCEPT',
  'SET',
  'VALUES',
  'AND',
  'OR',
  'ON',
]

// ─────────────────────────────────────────────────
// 서브쿼리 블록 인터페이스
// ─────────────────────────────────────────────────
export interface SubBlock {
  key: string
  inner: string
  alias: string
}

export interface ExtractResult {
  sql: string
  subBlocks: SubBlock[]
}

// ─────────────────────────────────────────────────
// 서브쿼리 추출기 (안→밖 순서)
// ─────────────────────────────────────────────────
export function extractSubqueries(sql: string): ExtractResult {
  let result = sql
  const blocks: SubBlock[] = []
  let counter = 0

  for (let i = 0; i < 20; i++) {
    const innerParenRe = /\(([^()]*)\)/g
    let match: RegExpExecArray | null
    let found = false

    while ((match = innerParenRe.exec(result)) !== null) {
      const inner = match[1].trim()
      if (/\bselect\b/i.test(inner)) {
        const key = `__SUBQ_${counter++}__`
        const afterParen = result.slice(match.index + match[0].length)

        // 공백 없이 바로 붙은 alias도 처리
        // ')as W_NM' 또는 ') as W_NM' 또는 ')  W_NM' 모두 대응
        const aliasRe = /^(\s*(?:as\s+)?\w+)?/i
        const aliasMatch = aliasRe.exec(afterParen)
        const aliasRaw = aliasMatch?.[1] ?? ''
        // aliasRaw가 순수 공백만 있거나 비어있으면 alias 없음
        const alias = aliasRaw.trim()

        // alias 무효 조건:
        //   1) 비어있음
        //   2) 절 키워드 (SELECT, FROM, WHERE 등)
        //   3) SQL 함수명 (DECODE, NVL, COALESCE 등)
        //   4) alias 직후 문자가 '(' → 함수 호출이므로 alias가 아님
        const aliasUpper = alias.toUpperCase()
        const isClauseKeyword = AUTO_CLAUSE_KEYWORDS.some(
          kw => kw.toUpperCase() === aliasUpper
        )
        const isFunctionKeyword = SQL_FUNCTION_KEYWORDS.some(
          fn => fn.toUpperCase() === aliasUpper
        )
        const afterAlias = afterParen.slice(aliasRaw.length).trimStart()
        const isFollowedByParen = afterAlias.startsWith('(')

        const validAlias =
          alias && !isClauseKeyword && !isFunctionKeyword && !isFollowedByParen
            ? alias
            : ''
        const validAliasRaw = validAlias ? aliasRaw : ''

        blocks.push({ key, inner, alias: validAlias })

        const totalLen = match[0].length + validAliasRaw.length
        result = result.slice(0, match.index) + '(' + key + result.slice(match.index + totalLen)
        found = true
        break
      }
    }
    if (!found) break
  }

  return { sql: result, subBlocks: blocks }
}

// ─────────────────────────────────────────────────
// 서브쿼리 복원기
// ─────────────────────────────────────────────────
// formatInner 콜백: (inner, baseIndent) → 포매팅된 내부 SQL
//   baseIndent : 해당 서브쿼리 블록의 닫는 ')' 기준 들여쓰기 문자열.
//                내부 줄은 baseIndent + 1단계를 적용해야 한다.
export function restoreSubqueries(
  sql: string,
  subBlocks: SubBlock[],
  cfg: FormatterConfig,
  formatInner?: (inner: string, baseIndent: string) => string
): string {
  let result = sql

  for (const sub of subBlocks) {
    const aliasStr = sub.alias ? `  ${sub.alias}` : ''

    const resultLines = result.split('\n')
    const newLines: string[] = []

    for (const line of resultLines) {
      const idx = line.indexOf(sub.key)
      if (idx === -1) {
        newLines.push(line)
        continue
      }

      const before = line.slice(0, idx)
      const after = line.slice(idx + sub.key.length)
      const beforeTrimmed = before.trimEnd()
      const hasParen = beforeTrimmed.endsWith('(')

      // ── 닫는 ')' 의 기준 들여쓰기 ──────────────────────────────
      // hasParen : '(' 바로 앞 문자열의 leading whitespace
      // 그 외    : 현재 라인의 leading whitespace
      // 탭/스페이스 혼용을 보존하기 위해 실제 문자를 슬라이스한다.
      const closingIndent = (() => {
        if (hasParen) {
          const withoutParen = beforeTrimmed.slice(0, -1)
          return withoutParen.match(/^(\s*)/)?.[1] ?? ''
        }
        return line.match(/^(\s*)/)?.[1] ?? ''
      })()

      // 내부 들여쓰기 단위 (탭 or 스페이스 N칸)
      const innerIndentUnit = cfg.indentType === 'tabs'
        ? '\t'
        : ' '.repeat(cfg.tabWidth)
      // 서브쿼리 내부 줄의 baseIndent = closingIndent + 1단계
      const innerBaseIndent = closingIndent + innerIndentUnit

      // formatInner 콜백으로 내부 SQL 포매팅 (baseIndent 전달)
      const formattedInner = formatInner
        ? formatInner(sub.inner, innerBaseIndent)
        : indentBlock(sub.inner, innerBaseIndent)

      const innerLines = formattedInner.split('\n')

      if (hasParen) {
        const beforeWithoutParen = beforeTrimmed.slice(0, -1).trimEnd()
        newLines.push(`${beforeWithoutParen}(${(innerLines[0] ?? '').trimStart()}`)
        for (const il of innerLines.slice(1)) newLines.push(il)
        newLines.push(`${closingIndent})${aliasStr}${after}`)
      } else {
        newLines.push(`${before}(${(innerLines[0] ?? '').trimStart()}`)
        for (const il of innerLines.slice(1)) newLines.push(il)
        newLines.push(`${closingIndent})${aliasStr}${after}`)
      }
    }

    result = newLines.join('\n')
  }

  return result
}

/**
 * 내부 SQL 블록의 각 줄 앞에 baseIndent 를 붙인다.
 * formatInner 콜백이 없을 때 기본 들여쓰기 적용용.
 */
export function indentBlock(sql: string, baseIndent: string): string {
  return sql
    .split('\n')
    .map(line => (line.trim() ? baseIndent + line.trim() : ''))
    .join('\n')
}

// ─────────────────────────────────────────────────
// 키워드 기준 줄바꿈 (서브쿼리 내용 평탄화용)
// ─────────────────────────────────────────────────
export function presplitByKeywords(sql: string, cfg: FormatterConfig): string {
  const keywords = AUTO_CLAUSE_KEYWORDS.map(k => applyCase(k, cfg))
  // 긴 키워드 우선
  const sorted = [...keywords].sort((a, b) => b.length - a.length)

  let result = sql
  for (const kw of sorted) {
    // 공백 + 키워드 + (공백 또는 줄 끝) 패턴으로 줄바꿈 삽입
    // RegExp 생성자 사용으로 $ 이스케이프 문제 방지
    const pattern = '([ \\t]+)(' + kw.replace(/ /g, '[ \\t]+') + ')(?=[ \\t]|$)'
    const re = new RegExp(pattern, 'gi')

    // 괄호 깊이를 추적하여 괄호 내부(함수 인자 등)의 키워드는 줄바꿈하지 않음
    result = splitRespectingParens(result, re)
  }
  return result
}

/**
 * 정규식 매치 위치의 괄호 깊이를 확인하여
 * depth === 0 인 경우에만 줄바꿈을 삽입한다.
 * - depth > 0  : DECODE/NVL 등의 함수 인자 내부 → 통과
 * - 문자열 리터럴('...') 내부의 괄호·키워드도 무시한다.
 */
function splitRespectingParens(sql: string, re: RegExp): string {
  re.lastIndex = 0
  const parts: string[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = re.exec(sql)) !== null) {
    const matchStart = match.index

    // match 시작 위치까지 괄호 깊이 계산
    // 문자열 리터럴('...') 내부는 건너뜀
    let depth = 0
    let inString = false
    for (let i = 0; i < matchStart; i++) {
      const ch = sql[i]
      if (inString) {
        if (ch === "'") {
          // 이스케이프된 '' 처리
          if (sql[i + 1] === "'") { i++; continue }
          inString = false
        }
        continue
      }
      if (ch === "'") { inString = true; continue }
      if (ch === '(') depth++
      else if (ch === ')') depth--
    }

    if (depth === 0) {
      parts.push(sql.slice(lastIndex, matchStart))
      parts.push('\n' + match[2]) // match[2] = 키워드
      lastIndex = matchStart + match[0].length
    }
    // depth > 0 이면 그냥 통과
  }

  parts.push(sql.slice(lastIndex))
  return parts.join('')
}

// ─────────────────────────────────────────────────
// 유틸 함수
// ─────────────────────────────────────────────────
export function applyCase(keyword: string, cfg: FormatterConfig): string {
  switch (cfg.keywordCase) {
    case 'upper': return keyword.toUpperCase()
    case 'lower': return keyword.toLowerCase()
    default: return keyword
  }
}