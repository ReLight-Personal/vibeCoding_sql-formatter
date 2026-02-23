import type { FormatRulesState } from '../types/formatRules'
import type { ReplaceRuleItem } from '../types/customRules'
import { defaultFormatRules } from '../types/formatRules'

const KEY_FORMAT_RULES = 'sql-tailor-format-rules'
const KEY_CUSTOM_RULES = 'sql-tailor-custom-rules'

export function loadFormatRules(): FormatRulesState | null {
  try {
    const raw = localStorage.getItem(KEY_FORMAT_RULES)
    if (!raw) return null
    const parsed = JSON.parse(raw) as FormatRulesState
    return { ...defaultFormatRules, ...parsed }
  } catch {
    return null
  }
}

export function saveFormatRules(rules: FormatRulesState): void {
  try {
    localStorage.setItem(KEY_FORMAT_RULES, JSON.stringify(rules))
  } catch {
    // quota or disabled
  }
}

export function loadCustomRules(): ReplaceRuleItem[] | null {
  try {
    const raw = localStorage.getItem(KEY_CUSTOM_RULES)
    if (!raw) return null
    const parsed = JSON.parse(raw) as ReplaceRuleItem[]
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function saveCustomRules(rules: ReplaceRuleItem[]): void {
  try {
    localStorage.setItem(KEY_CUSTOM_RULES, JSON.stringify(rules))
  } catch {
    // quota or disabled
  }
}
