/**
 * renderUtils.ts
 * ─────────────────────────────────────────────────
 * 토큰 렌더링 / 들여쓰기 / 키워드 케이스 유틸리티
 *
 * SqlFormatter 클래스 상태(this)에 의존하지 않는 순수 함수들.
 * formatter.ts와 향후 추가될 포매터 모듈이 공유한다.
 *
 * formatter.ts에서 분리.
 */

import type { SqlToken } from '../../types/token'
import type { FormatterConfig } from '../../types/config'

// ─────────────────────────────────────────────────
// 키워드 케이스 적용
// ─────────────────────────────────────────────────

/** 토큰에 keywordCase 설정을 적용하여 문자열로 반환 */
export function applyTokenCase(token: SqlToken, cfg: FormatterConfig): string {
  if (token.type === 'keyword') {
    switch (cfg.keywordCase) {
      case 'upper': return token.value.toUpperCase()
      case 'lower': return token.value.toLowerCase()
      default:      return token.originalCase ?? token.value
    }
  }
  return token.value
}

/** 키워드 문자열에 keywordCase 설정을 적용 */
export function applyKeywordCase(keyword: string, cfg: FormatterConfig): string {
  switch (cfg.keywordCase) {
    case 'upper': return keyword.toUpperCase()
    case 'lower': return keyword.toLowerCase()
    default:      return keyword
  }
}

// ─────────────────────────────────────────────────
// 들여쓰기
// ─────────────────────────────────────────────────

/** indentType / tabWidth 설정 기준으로 들여쓰기 문자열 생성 */
export function buildIndent(cfg: FormatterConfig, level: number): string {
  if (cfg.indentType === 'tabs') return '\t'.repeat(level)
  return ' '.repeat(level * cfg.tabWidth)
}

// ─────────────────────────────────────────────────
// 컬럼 포매팅 (콤마 위치 처리)
// ─────────────────────────────────────────────────

/**
 * 단일 컬럼 문자열에 들여쓰기와 콤마를 적용
 *
 * @param colStr     렌더링된 컬럼 표현식 문자열
 * @param cfg        포매터 설정
 * @param indentLevel 들여쓰기 레벨
 * @param index      컬럼 인덱스 (0-based)
 * @param total      전체 컬럼 수
 */
export function formatColumnStr(
  colStr: string,
  cfg: FormatterConfig,
  indentLevel: number,
  index: number,
  total: number
): string {
  const ind = buildIndent(cfg, indentLevel)
  const isLast = index === total - 1

  if (cfg.commaPosition === 'leading') {
    const prefix = index === 0 ? '  ' : ', '
    return `${ind}${prefix}${colStr}`
  } else {
    // trailing
    const suffix = isLast ? '' : ','
    return `${ind}${colStr}${suffix}`
  }
}

// ─────────────────────────────────────────────────
// 토큰 렌더링
// ─────────────────────────────────────────────────

/**
 * 토큰 배열을 SQL 문자열로 렌더링
 *
 * - 공백 토큰 제거 후 재조합
 * - 연산자 / 점(.) / 괄호 / 콤마 주변 공백 처리
 * - keywordCase / denseOperators 설정 반영
 */
export function renderTokens(tokens: SqlToken[], cfg: FormatterConfig): string {
  const nonWs = tokens.filter(t => t.type !== 'whitespace')
  const parts: string[] = []

  for (let i = 0; i < nonWs.length; i++) {
    const t    = nonWs[i]
    const prev = nonWs[i - 1]

    const value = applyTokenCase(t, cfg)

    // 연산자 공백 처리
    if (t.type === 'operator') {
      if (cfg.denseOperators) {
        // dense 모드: 앞 공백 제거, 뒤 공백 없이 붙임
        if (parts.length > 0) {
          parts[parts.length - 1] = parts[parts.length - 1].replace(/ $/, '')
        }
        parts.push(value)
        continue
      }
      // 일반 모드: 연산자 앞 공백 확보 후 뒤에 공백 추가
      if (parts.length > 0) {
        const last = parts[parts.length - 1]
        if (!last.endsWith(' ')) parts[parts.length - 1] = last + ' '
      }
      parts.push(value + ' ')
      continue
    }

    // 점(.) 전후 공백 없음
    const prevIsDot  = prev?.type === 'dot'
    const isDotToken = t.type === 'dot'

    if (isDotToken) {
      // dot 자체: 앞 공백 제거 후 붙임
      if (parts.length > 0) parts[parts.length - 1] = parts[parts.length - 1].replace(/ $/, '')
      parts.push(value)
      continue
    }

    if (prevIsDot) {
      // dot 바로 다음 토큰: identifier / number만 공백 없이 붙임
      // keyword(AS, IN 등)나 다른 타입은 공백 유지
      if (t.type === 'identifier' || t.type === 'number') {
        if (parts.length > 0) parts[parts.length - 1] = parts[parts.length - 1].replace(/ $/, '')
        parts.push(value + ' ')
        continue
      }
    }

    // 닫는 괄호 앞 공백 제거
    if (t.value === ')' && parts.length > 0) {
      parts[parts.length - 1] = parts[parts.length - 1].replace(/ $/, '')
      parts.push(value)
      continue
    }

    // 여는 괄호: 뒤에 공백 없이 (다음 토큰이 바로 붙도록)
    if (t.value === '(') {
      parts.push(value)
      continue
    }

    // 콤마 앞 공백 제거, 뒤에 공백 추가
    if (t.type === 'comma') {
      if (parts.length > 0) parts[parts.length - 1] = parts[parts.length - 1].replace(/ $/, '')
      parts.push(value + ' ')
      continue
    }

    // comment 토큰: 뒤에 반드시 공백 추가 (다음 토큰과 붙지 않도록)
    if (t.type === 'comment') {
      parts.push(value + ' ')
      continue
    }

    parts.push(value + ' ')
  }

  return parts.join('').trimEnd()
}