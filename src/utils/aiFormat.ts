import type { FormatRulesState } from '../types/formatRules'
import type { AiProvider } from '../types/ai'

/** 현재 포맷 규칙을 LLM용 설명 텍스트로 변환 */
export function buildRulesDescription(rules: FormatRulesState): string {
  const parts: string[] = []
  if (rules.keywordCaseEnabled) {
    parts.push(`- 예약어(키워드)는 ${rules.keywordCase === 'upper' ? '대문자' : rules.keywordCase === 'lower' ? '소문자' : '원본 유지'}로 표기`)
  }
  if (rules.commaPositionEnabled) {
    parts.push(`- 콤마는 ${rules.commaPosition === 'leading' ? '줄 앞(leading)' : '줄 뒤(trailing)'}에 배치`)
  }
  if (rules.indentEnabled) {
    parts.push(
      `- 들여쓰기는 ${rules.indentType === 'tabs' ? '탭' : `스페이스 ${rules.tabWidth}칸`} 사용`
    )
  }
  if (rules.operatorSpacingEnabled) {
    parts.push(`- 연산자 주변 공백: ${rules.denseOperators ? '없음' : '있음'}`)
  }
  return parts.length ? parts.join('\n') : '가독성을 위해 일반적인 SQL 포매팅 규칙을 적용해 주세요.'
}

const SYSTEM_PROMPT = `You are a SQL formatting assistant. Given a SQL query and formatting rules, return ONLY the reformatted SQL. No explanations, no markdown code fences, no extra text. Output must be valid SQL only.`

function buildUserPrompt(sql: string, rulesDescription: string): string {
  return `Apply the following formatting rules to the SQL below.

Rules:
${rulesDescription}

SQL to format:
\`\`\`
${sql}
\`\`\`

Return only the formatted SQL, nothing else.`
}

async function callOpenAI(apiKey: string, userPrompt: string): Promise<string> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 4096,
      temperature: 0.2,
    }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: { message?: string } }).error?.message ?? `OpenAI API 오류: ${res.status}`)
  }
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> }
  const content = data.choices?.[0]?.message?.content?.trim()
  if (!content) throw new Error('AI가 응답을 반환하지 않았습니다.')
  return content.replace(/^```(?:\w+)?\s*|\s*```$/g, '').trim()
}

async function callAnthropic(apiKey: string, userPrompt: string): Promise<string> {
  const res = await fetch(
    'https://api.anthropic.com/v1/messages',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    }
  )
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    const msg = (err as { error?: { message?: string } }).error?.message
    throw new Error(msg ?? `Anthropic API 오류: ${res.status}`)
  }
  const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> }
  const block = data.content?.find((c) => c.type === 'text')
  const content = block && 'text' in block ? (block as { text: string }).text?.trim() : ''
  if (!content) throw new Error('AI가 응답을 반환하지 않았습니다.')
  return content.replace(/^```(?:\w+)?\s*|\s*```$/g, '').trim()
}

/**
 * LLM에 쿼리와 규칙을 전달해 포맷된 SQL 문자열을 반환합니다.
 */
export async function requestAiFormat(
  provider: AiProvider,
  apiKey: string,
  sql: string,
  rules: FormatRulesState
): Promise<string> {
  const rulesDesc = buildRulesDescription(rules)
  const userPrompt = buildUserPrompt(sql, rulesDesc)
  const key = apiKey.trim()
  if (!key) throw new Error('API 키를 입력해 주세요.')

  if (provider === 'openai') return callOpenAI(key, userPrompt)
  if (provider === 'anthropic') return callAnthropic(key, userPrompt)
  throw new Error('지원하지 않는 프로바이더입니다.')
}
