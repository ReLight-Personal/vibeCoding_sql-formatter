import RulePanel from './RulePanel'
import TemplatePanel from './TemplatePanel'
import AiPanel from './AiPanel'
import type { FormatRulesState } from '../types/formatRules'
import type { ReplaceRuleItem } from '../types/customRules'
import type { AiProvider } from '../types/ai'
import './Sidebar.css'

interface SidebarProps {
  rules: FormatRulesState
  onRulesChange: (rules: FormatRulesState) => void
  customRules: ReplaceRuleItem[]
  onCustomRulesChange: (rules: ReplaceRuleItem[]) => void
  aiProvider: AiProvider
  apiKey: string
  onAiProviderChange: (provider: AiProvider) => void
  onApiKeyChange: (key: string) => void
  onSaveApiKey: () => void
  onClearApiKey: () => void
  onRequestAi: () => void
  aiLoading: boolean
  keySaved: boolean
  isHidden?: boolean
  onToggle?: () => void
}

export default function Sidebar({
  rules,
  onRulesChange,
  customRules,
  onCustomRulesChange,
  aiProvider,
  apiKey,
  onAiProviderChange,
  onApiKeyChange,
  onSaveApiKey,
  onClearApiKey,
  onRequestAi,
  aiLoading,
  keySaved,
  isHidden = false,
  onToggle,
}: SidebarProps) {
  return (
    <div>
      <div className={`sidebar ${isHidden ? 'is-closed' : ''}`}>
        <RulePanel rules={rules} onChange={onRulesChange} />
        <TemplatePanel rules={customRules} onChange={onCustomRulesChange} />
        <AiPanel
          provider={aiProvider}
          apiKey={apiKey}
          onProviderChange={onAiProviderChange}
          onApiKeyChange={onApiKeyChange}
          onSaveKey={onSaveApiKey}
          onClearKey={onClearApiKey}
          onRequestAi={onRequestAi}
          isLoading={aiLoading}
          keySaved={keySaved}
        />
      </div>
      {onToggle && (
        <button className={`sidebar-toggle-button ${isHidden ? 'is-closed' : ''}`} onClick={onToggle}>
          {isHidden ? '＞' : '×'}
        </button>
      )}
    </div>
  )
}
