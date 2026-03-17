/**
 * subqueryUtils.ts
 * ─────────────────────────────────────────────────
 * 서브쿼리 처리 유틸리티
 * 
 * autoIndentFormatter.ts와 formatter.ts가 공유하는 서브쿼리 처리 로직
 */

import type { FormatterConfig } from '../types/config'

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

        // alias가 SQL 키워드이거나 비어있으면 alias로 취급하지 않음
        const isKeyword = AUTO_CLAUSE_KEYWORDS.some(
          kw => kw.toUpperCase() === alias.toUpperCase()
        )
        const validAlias = alias && !isKeyword ? alias : ''
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
export function restoreSubqueries(
  sql: string, 
  subBlocks: SubBlock[], 
  _cfg: FormatterConfig,
  formatInner?: (inner: string) => string
): string {
  let result = sql

  for (const sub of subBlocks) {
    const lines = result.split('\n')
    let subqBaseIndent = ''

    for (const line of lines) {
      const idx = line.indexOf(sub.key)
      if (idx !== -1) {
        subqBaseIndent = ' '.repeat(idx)
        break
      }
    }

    // 내부 포매팅 콜백이 있으면 적용, 없으면 원본 사용
    const formattedInner = formatInner ? formatInner(sub.inner) : sub.inner

    const closingIndent = subqBaseIndent.length > 0
      ? ' '.repeat(subqBaseIndent.length - 1)
      : ''

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
    result = result.replace(re, (_match, _space, kword) => '\n' + kword)
  }
  return result
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
