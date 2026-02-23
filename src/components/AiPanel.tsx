import type { AiProvider } from '../types/ai'
import './AiPanel.css'

interface AiPanelProps {
  provider: AiProvider
  apiKey: string
  onProviderChange: (p: AiProvider) => void
  onApiKeyChange: (key: string) => void
  onSaveKey: () => void
  onClearKey: () => void
  onRequestAi: () => void
  isLoading: boolean
  keySaved: boolean
}

export default function AiPanel({
  provider,
  apiKey,
  onProviderChange,
  onApiKeyChange,
  onSaveKey,
  onClearKey,
  onRequestAi,
  isLoading,
  keySaved,
}: AiPanelProps) {
  const displayKey = keySaved && apiKey ? `${apiKey.slice(0, 8)}...` : ''

  return (
    <aside className="ai-panel">
      <h2 className="ai-panel-title">AI 도움</h2>
      <p className="ai-panel-desc">쿼리와 규칙을 LLM에 보내 가독성 개선 결과를 받습니다.</p>

      <section className="ai-form">
        <div className="ai-form-row">
          <label>프로바이더</label>
          <select
            value={provider}
            onChange={(e) => onProviderChange(e.target.value as AiProvider)}
          >
            <option value="openai">OpenAI (GPT)</option>
            <option value="anthropic">Anthropic (Claude)</option>
          </select>
        </div>
        <div className="ai-form-row">
          <label>API Key</label>
          {keySaved && apiKey ? (
            <div className="ai-key-saved">
              <span className="ai-key-masked">{displayKey}</span>
              <button type="button" className="ai-key-reset" onClick={onClearKey}>
                다시 입력
              </button>
            </div>
          ) : (
            <>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => onApiKeyChange(e.target.value)}
                placeholder={provider === 'openai' ? 'sk-...' : 'sk-ant-...'}
                autoComplete="off"
                className="ai-key-input"
              />
              <button
                type="button"
                className="ai-save-key-btn"
                onClick={onSaveKey}
                disabled={!apiKey.trim()}
              >
                저장
              </button>
            </>
          )}
        </div>
        <p className="ai-key-hint">키는 브라우저에만 저장됩니다. 외부로 전송되지 않습니다.</p>
      </section>

      <button
        type="button"
        className="ai-request-btn"
        onClick={onRequestAi}
        disabled={!keySaved || isLoading}
      >
        {isLoading ? '처리 중...' : 'AI 도움받기'}
      </button>
    </aside>
  )
}
