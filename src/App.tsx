import { useState, useEffect, useCallback } from 'react'
import './App.css'
import Banner from './components/Banner'
import EditorPanel from './components/EditorPanel'
import RulePanel from './components/RulePanel'
import TemplatePanel from './components/TemplatePanel'
import AiPanel from './components/AiPanel'
import AiPreviewModal from './components/AiPreviewModal'
import { formatWithRules } from './utils/formatSql'
import { applyReplaceRules } from './utils/applyReplaceRules'
import { requestAiFormat } from './utils/aiFormat'
import {
  loadFormatRules,
  saveFormatRules,
  loadCustomRules,
  saveCustomRules,
  loadAiProvider,
  saveAiProvider,
  loadAiApiKey,
  saveAiApiKey,
} from './utils/storage'
import { defaultFormatRules, type FormatRulesState } from './types/formatRules'
import type { ReplaceRuleItem } from './types/customRules'
import type { AiProvider } from './types/ai'

function App() {
  const [inputSql, setInputSql] = useState('')
  const [outputSql, setOutputSql] = useState('')
  const [rules, setRules] = useState<FormatRulesState>(() => loadFormatRules() ?? defaultFormatRules)
  const [customRules, setCustomRules] = useState<ReplaceRuleItem[]>(() => loadCustomRules() ?? [])

  const [aiProvider, setAiProvider] = useState<AiProvider>(() => loadAiProvider() ?? 'openai')
  const [apiKey, setApiKey] = useState('')
  const [keySaved, setKeySaved] = useState(false)

  useEffect(() => {
    const stored = loadAiApiKey(aiProvider)
    setApiKey(stored)
    setKeySaved(stored.length > 0)
  }, [aiProvider])
  const [aiLoading, setAiLoading] = useState(false)
  const [aiPreview, setAiPreview] = useState<{ before: string; after: string } | null>(null)

  useEffect(() => {
    saveFormatRules(rules)
  }, [rules])

  useEffect(() => {
    saveCustomRules(customRules)
  }, [customRules])

  useEffect(() => {
    saveAiProvider(aiProvider)
  }, [aiProvider])

  const runFormat = useCallback(() => {
    if (!inputSql.trim()) {
      setOutputSql('')
      return
    }
    try {
      let result = formatWithRules(inputSql, rules)
      result = applyReplaceRules(result, customRules)
      setOutputSql(result)
    } catch (error) {
      setOutputSql(
        `포매팅 오류: ${error instanceof Error ? error.message : '알 수 없는 오류'}`
      )
    }
  }, [inputSql, rules, customRules])

  const handleFormat = () => runFormat()

  useEffect(() => {
    if (!inputSql.trim()) return
    try {
      let result = formatWithRules(inputSql, rules)
      result = applyReplaceRules(result, customRules)
      setOutputSql(result)
    } catch (error) {
      setOutputSql(
        `포매팅 오류: ${error instanceof Error ? error.message : '알 수 없는 오류'}`
      )
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 규칙 변경 시에만 재포맷
  }, [rules, customRules])

  const handleSaveApiKey = () => {
    saveAiApiKey(aiProvider, apiKey)
    setKeySaved(true)
  }

  const handleClearApiKey = () => {
    saveAiApiKey(aiProvider, '')
    setApiKey('')
    setKeySaved(false)
  }

  const handleApiKeyChange = (key: string) => {
    setApiKey(key)
    if (keySaved) setKeySaved(false)
  }

  const handleRequestAi = async () => {
    if (!inputSql.trim() || !apiKey.trim()) return
    setAiLoading(true)
    try {
      const after = await requestAiFormat(aiProvider, apiKey, inputSql, rules)
      const before = outputSql || inputSql
      setAiPreview({ before, after })
    } catch (error) {
      setOutputSql(
        `AI 오류: ${error instanceof Error ? error.message : '알 수 없는 오류'}`
      )
    } finally {
      setAiLoading(false)
    }
  }

  const handleApplyAiResult = () => {
    if (aiPreview) {
      setOutputSql(aiPreview.after)
      setAiPreview(null)
    }
  }

  return (
    <div className="app">
      <Banner />
      <div className="main-content">
        <div className="sidebar">
          <RulePanel rules={rules} onChange={setRules} />
          <TemplatePanel rules={customRules} onChange={setCustomRules} />
          <AiPanel
            provider={aiProvider}
            apiKey={apiKey}
            onProviderChange={setAiProvider}
            onApiKeyChange={handleApiKeyChange}
            onSaveKey={handleSaveApiKey}
            onClearKey={handleClearApiKey}
            onRequestAi={handleRequestAi}
            isLoading={aiLoading}
            keySaved={keySaved}
          />
        </div>
        <div className="editor-container">
          <EditorPanel
            title="Input"
            value={inputSql}
            onChange={setInputSql}
            placeholder="SQL 쿼리를 입력하세요..."
          />
          <div className="divider">
            <button className="format-button" onClick={handleFormat}>
              정렬하기 →
            </button>
          </div>
          <EditorPanel
            title="Output"
            value={outputSql}
            onChange={setOutputSql}
            placeholder="정렬된 결과가 여기에 표시됩니다..."
            readOnly
          />
        </div>
      </div>

      {aiPreview && (
        <AiPreviewModal
          before={aiPreview.before}
          after={aiPreview.after}
          onApply={handleApplyAiResult}
          onCancel={() => setAiPreview(null)}
        />
      )}
    </div>
  )
}

export default App
