/** 지원 LLM 프로바이더 */
export type AiProvider = 'openai' | 'anthropic'

export interface AiConfig {
  provider: AiProvider
  /** 마스킹하지 않은 키는 로컬에만 저장 (보안 유의) */
  apiKey: string
}

/** API 키 형식 간단 검사 (sk-로 시작 등) */
export function validateApiKeyFormat(provider: AiProvider, key: string): boolean {
  const trimmed = key.trim()
  if (!trimmed) return false
  if (provider === 'openai') return trimmed.startsWith('sk-')
  if (provider === 'anthropic') return trimmed.length >= 20
  return false
}
