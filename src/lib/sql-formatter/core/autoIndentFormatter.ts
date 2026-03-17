/**
 * autoIndentFormatter.ts
 * ─────────────────────────────────────────────────
 * Auto 들여쓰기 전용 포매터
 *
 * Rule 1. SQL 키워드마다 줄바꿈
 * Rule 2. 가장 긴 키워드 길이 기준 우측 정렬 패딩
 * Rule 3. 키워드 뒤 첫 번째 내용은 줄바꿈 없이 2칸 공백으로 연결
 * Rule 4. 서브쿼리는 '(' 바로 다음 위치를 기준으로 내부 정렬
 */

import type { FormatterConfig } from '../types/config'

// ─────────────────────────────────────────────────
// Auto 포매팅 대상 절 키워드 목록
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
// 메인 진입점
// ─────────────────────────────────────────────────
export function applyAutoIndent(sql: string, cfg: FormatterConfig): string {
  return formatBlock(sql, cfg, '')
}

// ─────────────────────────────────────────────────
// 한 줄 SQL을 키워드 기준으로 미리 줄바꿈
// formatter.ts가 서브쿼리를 한 줄로 평탄화해서 내보낼 때 필요
// ─────────────────────────────────────────────────
function presplitByKeywords(sql: string, cfg: FormatterConfig): string {
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
// 블록 단위 포매터 (재귀)
// baseIndent: 이 블록의 모든 줄 앞에 붙는 고정 문자열
// ─────────────────────────────────────────────────
function formatBlock(sql: string, cfg: FormatterConfig, baseIndent: string): string {
  const clauseKeywords = AUTO_CLAUSE_KEYWORDS.map(k => applyCase(k, cfg))

  // ── 1. 서브쿼리 추출 ──
  const extracted = extractSubqueries(sql)

  // ── 2. 줄 단위 분리 & 세그먼트 분류 ──
  interface Segment {
    keyword: string
    rest: string
    rawLine: string
    isKeywordLine: boolean
  }

  const rawLines = extracted.sql.split('\n')
  const segments: Segment[] = []

  for (const rawLine of rawLines) {
    const trimmed = rawLine.trim()
    if (trimmed === '') {
      segments.push({ keyword: '', rest: '', rawLine: '', isKeywordLine: false })
      continue
    }
    const matched = matchClauseKeyword(trimmed, clauseKeywords)
    if (matched) {
      segments.push({
        keyword: matched,
        rest: trimmed.slice(matched.length).trimStart(),
        rawLine: trimmed,
        isKeywordLine: true,
      })
    } else {
      segments.push({ keyword: '', rest: '', rawLine: trimmed, isKeywordLine: false })
    }
  }

  // ── 3. rest가 빈 키워드 뒤 첫 번째 비키워드 줄을 rest로 병합 (Rule 3 보완) ──
  // formatter.ts가 'SELECT col1' 처럼 키워드와 내용을 분리해서 출력하는 경우 처리
  const merged: Segment[] = []
  let mi = 0
  while (mi < segments.length) {
    const seg = segments[mi]
    if (seg.isKeywordLine && seg.rest === '') {
      const next = segments[mi + 1]
      if (next && !next.isKeywordLine && next.rawLine !== '') {
        merged.push({ ...seg, rest: next.rawLine })
        mi += 2
        continue
      }
    }
    merged.push(seg)
    mi++
  }

  // ── 4. 최대 키워드 길이 ──
  const usedKeywords = merged.filter(s => s.isKeywordLine).map(s => s.keyword)
  const maxLen = getMaxKeywordLength(usedKeywords)
  const contentPad = baseIndent + ' '.repeat(maxLen + 2)

  // ── 5. 줄 재구성 ──
  const resultLines: string[] = []

  for (const seg of merged) {
    if (!seg.isKeywordLine && seg.rawLine === '') {
      if (resultLines.length > 0 && resultLines[resultLines.length - 1] !== '') {
        resultLines.push('')
      }
      continue
    }
    if (!seg.isKeywordLine) {
      resultLines.push(`${contentPad}${seg.rawLine}`)
      continue
    }
    const kwPad = baseIndent + ' '.repeat(maxLen - seg.keyword.length)
    resultLines.push(
      seg.rest.length > 0
        ? `${kwPad}${seg.keyword}  ${seg.rest}`
        : `${kwPad}${seg.keyword}`
    )
  }

  while (resultLines.length > 0 && resultLines[resultLines.length - 1] === '') {
    resultLines.pop()
  }

  let result = resultLines.join('\n')

  // ── 5. 서브쿼리 플레이스홀더 복원 ──
  for (const sub of extracted.subBlocks) {
    const lines = result.split('\n')
    let subqBaseIndent = contentPad

    for (const line of lines) {
      const idx = line.indexOf(sub.key)
      if (idx !== -1) {
        subqBaseIndent = ' '.repeat(idx)
        break
      }
    }

    // Fix 1: inner가 한 줄인 경우 키워드 기준으로 미리 줄바꿈 적용
    const normalizedInner = presplitByKeywords(sub.inner, cfg)

    const formattedInner = formatBlock(normalizedInner, cfg, subqBaseIndent)

    const closingIndent = subqBaseIndent.length > 0
      ? ' '.repeat(subqBaseIndent.length - 1)
      : ''

    const aliasStr = sub.alias ? `  ${sub.alias}` : ''

    const resultLines2 = result.split('\n')
    const newLines: string[] = []

    for (const line of resultLines2) {
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
// 서브쿼리 추출기 (안→밖 순서)
// Fix 2: alias 추출 시 공백 없는 경우도 처리 (denseOperators 대응)
// ─────────────────────────────────────────────────
interface SubBlock {
  key: string
  inner: string
  alias: string
}

interface ExtractResult {
  sql: string
  subBlocks: SubBlock[]
}

function extractSubqueries(sql: string): ExtractResult {
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

        // Fix 2: 공백 없이 바로 붙은 alias도 처리
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
// 유틸 함수
// ─────────────────────────────────────────────────
function getMaxKeywordLength(usedKeywords: string[]): number {
  if (usedKeywords.length === 0) return 0
  return Math.max(...usedKeywords.map(k => k.length))
}

function matchClauseKeyword(line: string, keywords: string[]): string | null {
  const upper = line.toUpperCase()
  const sorted = [...keywords].sort((a, b) => b.length - a.length)
  for (const kw of sorted) {
    const kwUpper = kw.toUpperCase()
    if (upper.startsWith(kwUpper)) {
      const afterKw = line[kw.length]
      if (afterKw === undefined || afterKw === ' ' || afterKw === '\t') {
        return kw
      }
    }
  }
  return null
}

function applyCase(keyword: string, cfg: FormatterConfig): string {
  switch (cfg.keywordCase) {
    case 'upper': return keyword.toUpperCase()
    case 'lower': return keyword.toLowerCase()
    default: return keyword
  }
}
