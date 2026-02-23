import type { FormatRulesState } from '../types/formatRules'
import type { ReplaceRuleItem } from '../types/customRules'
import type { AiProvider } from '../types/ai'
import { defaultFormatRules } from '../types/formatRules'

const KEY_FORMAT_RULES = 'sql-tailor-format-rules'
const KEY_CUSTOM_RULES = 'sql-tailor-custom-rules'
const KEY_AI_PROVIDER = 'sql-tailor-ai-provider'
const KEY_AI_API_KEY_PREFIX = 'sql-tailor-ai-api-key-'

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

export function loadAiProvider(): AiProvider | null {
  try {
    const raw = localStorage.getItem(KEY_AI_PROVIDER)
    if (raw !== 'openai' && raw !== 'anthropic') return null
    return raw
  } catch {
    return null
  }
}

export function saveAiProvider(provider: AiProvider): void {
  try {
    localStorage.setItem(KEY_AI_PROVIDER, provider)
  } catch {}
}

function aiKeyStorageKey(provider: AiProvider): string {
  return KEY_AI_API_KEY_PREFIX + provider
}

export function loadAiApiKey(provider: AiProvider): string {
  try {
    return localStorage.getItem(aiKeyStorageKey(provider)) ?? ''
  } catch {
    return ''
  }
}

export function saveAiApiKey(provider: AiProvider, key: string): void {
  try {
    localStorage.setItem(aiKeyStorageKey(provider), key)
  } catch {}
}
