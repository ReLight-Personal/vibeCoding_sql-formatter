/** 사용자 정의 대체 규칙: 텍스트 또는 정규식 */
export type ReplaceRuleType = 'text' | 'regex'

export interface ReplaceRuleItem {
  id: string
  type: ReplaceRuleType
  /** 찾을 문자열 또는 정규식 패턴 */
  find: string
  /** 바꿀 문자열 (정규식일 때 캡처 그룹 사용 가능) */
  replace: string
  /** 규칙 사용 여부 */
  enabled: boolean
}

export function createReplaceRule(
  overrides: Partial<Omit<ReplaceRuleItem, 'id'>> & { id?: string }
): ReplaceRuleItem {
  return {
    id: overrides.id ?? `rule-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    type: 'text',
    find: '',
    replace: '',
    enabled: true,
    ...overrides,
  }
}
