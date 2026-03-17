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
import { extractSubqueries, restoreSubqueries, presplitByKeywords, AUTO_CLAUSE_KEYWORDS, applyCase } from './subqueryUtils'

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


// ─────────────────────────────────────────────────
// 메인 진입점
// ─────────────────────────────────────────────────
export function applyAutoIndent(sql: string, cfg: FormatterConfig): string {
  return formatBlock(sql, cfg, '')
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

  // ── 6. 서브쿼리 플레이스홀더 복원 ──
  result = restoreSubqueries(
    result, 
    extracted.subBlocks, 
    cfg,
    (inner) => {
      // 내부 서브쿼리도 auto 포매팅 적용
      const normalizedInner = presplitByKeywords(inner, cfg)
      return formatBlock(normalizedInner, cfg, baseIndent)
    }
  )

  return result
}
