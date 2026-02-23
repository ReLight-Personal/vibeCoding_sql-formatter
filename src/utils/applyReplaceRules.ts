import type { ReplaceRuleItem } from '../types/customRules'

/**
 * 사용자 정의 규칙(텍스트/정규식)을 순서대로 적용한 결과를 반환합니다.
 * 활성화(enabled)된 규칙만 적용합니다.
 */
export function applyReplaceRules(sql: string, rules: ReplaceRuleItem[]): string {
  let result = sql
  for (const rule of rules) {
    if (!rule.enabled || !rule.find) continue
    try {
      if (rule.type === 'regex') {
        const regex = new RegExp(rule.find, 'g')
        result = result.replace(regex, rule.replace)
      } else {
        result = result.split(rule.find).join(rule.replace)
      }
    } catch {
      // 잘못된 정규식 등은 무시하고 다음 규칙 적용
    }
  }
  return result
}
