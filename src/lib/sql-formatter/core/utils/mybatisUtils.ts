/**
 * mybatisUtils.ts
 * ─────────────────────────────────────────────────
 * MyBatis 템플릿 처리 유틸리티
 *
 * MyBatis XML 태그 / 파라미터를 플레이스홀더로 치환하여
 * 순수 SQL 포매팅이 가능하도록 하고, 포매팅 후 원본으로 복원한다.
 *
 * formatter.ts에서 분리.
 */

// ─────────────────────────────────────────────────
// 태그 분류 정규식
//
// - structural : <where>, <set> → SQL 구조 절을 대체하는 태그
//                파서가 WHERE / SET 키워드를 찾을 수 있도록
//                키워드 sentinel(__MYBATIS_WHERE__, __MYBATIS_SET__)을 함께 삽입
// - block      : <if>, <foreach>, <choose> 등 → 조건/반복 블록
// - inline     : #{param}, ${param} → 값 파라미터
// ─────────────────────────────────────────────────
export const STRUCTURAL_TAG_RE =
  /^<\/?(?:where|set)\b/i

export const BLOCK_TAG_RE =
  /^<\/?(?:if|foreach|choose|when|otherwise|trim|bind|include|sql|mapper|resultMap|select|insert|update|delete)\b/i

// ─────────────────────────────────────────────────
// MyBatis 마커 감지
// ─────────────────────────────────────────────────
export function hasMybatisMarkers(sql: string): boolean {
  return /[#$]\{[^}]*\}|<(?:if|where|set|foreach|choose|when|otherwise|trim|bind)\b|<!\[CDATA\[/i.test(sql)
}

// ─────────────────────────────────────────────────
// 추출 결과 타입
// ─────────────────────────────────────────────────
export interface ExtractedTemplate {
  sql: string
  placeholders: Map<string, string>
}

// ─────────────────────────────────────────────────
// MyBatis 템플릿 처리기
// ─────────────────────────────────────────────────
export class MyBatisTemplateHandler {
  private counter = 0

  /** MyBatis 태그/파라미터를 플레이스홀더로 치환 후 순수 SQL 반환 */
  extract(input: string): ExtractedTemplate {
    const placeholders = new Map<string, string>()
    this.counter = 0

    let sql = input

    // 0) CDATA → open/close 각각 플레이스홀더로 보존, 내부 SQL은 그대로 노출
    //    별도 cdataCounter를 사용해 TAG/PARAM 번호와 충돌하지 않도록 함
    let cdataCounter = 0
    sql = sql.replace(/(<!\[CDATA\[)([\s\S]*?)(\]\]>)/g, (_m, _open, inner) => {
      const openKey  = `__MYBATIS_CDATA_OPEN_${cdataCounter}__`
      const closeKey = `__MYBATIS_CDATA_CLOSE_${cdataCounter}__`
      cdataCounter++
      placeholders.set(openKey,  '<![CDATA[')
      placeholders.set(closeKey, ']]>')
      return `${openKey}\n${inner}\n${closeKey}`
    })

    // 1) #{param}, ${param} → 인라인 파라미터 플레이스홀더
    sql = sql.replace(/[#$]\{[^}]*\}/g, (match) => {
      const key = `__MYBATIS_PARAM_${this.counter++}__`
      placeholders.set(key, match)
      return key
    })

    // 2) XML 태그 치환
    //    structural 태그(<where>, <set>)는 닫는 태그도 고려하여 처리
    sql = sql.replace(
      /<\/?(?:if|where|set|foreach|choose|when|otherwise|trim|bind|include|sql|mapper|resultMap|select|insert|update|delete)(?:\s[^>]*)?\/?>/gi,
      (match) => {
        const key = `__MYBATIS_TAG_${this.counter++}__`
        placeholders.set(key, match)

        // structural 열림 태그: 파서가 절을 인식하도록 sentinel 키워드 삽입
        // 앞뒤 공백을 반드시 포함하여 인접 토큰과의 merge를 방지
        if (STRUCTURAL_TAG_RE.test(match) && !match.startsWith('</')) {
          const tagNameMatch = match.match(/^<(\w+)/i)
          const tagName = tagNameMatch ? tagNameMatch[1].toUpperCase() : ''
          if (tagName === 'WHERE') return ` ${key} WHERE `
          if (tagName === 'SET')   return ` ${key} SET `
        }

        // 모든 태그 앞뒤에 공백 삽입 → 인접 토큰과 합쳐지는 merge 버그 방지
        return ` ${key} `
      }
    )

    return { sql, placeholders }
  }

  /** 포매팅된 SQL에 플레이스홀더를 원본으로 복원 */
  restore(sql: string, placeholders: Map<string, string>): string {
    let result = sql

    for (const [key, original] of placeholders) {
      // CDATA open/close 플레이스홀더: 줄바꿈 처리 후 복원
      if (key.includes('_CDATA_OPEN_')) {
        result = result.split(key).join(original)
        continue
      }
      if (key.includes('_CDATA_CLOSE_')) {
        // ]]> 앞에 줄바꿈이 없으면 추가
        result = result.split(key).join('\n' + original)
        continue
      }

      // structural 태그의 sentinel 키워드 + 공백도 함께 제거하며 복원
      const isStructuralOpen =
        STRUCTURAL_TAG_RE.test(original) && !original.startsWith('</')

      if (isStructuralOpen) {
        const tagName = original.match(/^<(\w+)/i)?.[1]?.toUpperCase() ?? ''
        // " PLACEHOLDER WHERE " / " PLACEHOLDER SET " 패턴 → 원본 태그로 복원
        result = result.split(` ${key} ${tagName} `).join('\n' + original + '\n')
        result = result.split(` ${key} ${tagName.toLowerCase()} `).join('\n' + original + '\n')
        result = result.split(`${key} ${tagName} `).join(original + '\n')
        result = result.split(`${key} ${tagName.toLowerCase()} `).join(original + '\n')
        result = result.split(` ${key} `).join(original)
        result = result.split(key).join(original)
      } else {
        result = result.split(` ${key} `).join(original)
        result = result.split(key).join(original)
      }
    }

    return result
  }
}