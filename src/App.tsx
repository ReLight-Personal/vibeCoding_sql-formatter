import { useState, useEffect, useCallback } from 'react'
import './App.css'
import Banner from './components/Banner'
import Sidebar from './components/Sidebar'
import EditorContainer from './components/EditorContainer'
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
  const [detectedDialect, setDetectedDialect] = useState('')
  const [rules, setRules] = useState<FormatRulesState>(() => loadFormatRules() ?? defaultFormatRules)
  const [customRules, setCustomRules] = useState<ReplaceRuleItem[]>(() => loadCustomRules() ?? [])
  const [isTopBannerHidden, setIsTopBannerHidden] = useState(false)
  const [isBottomBannerHidden, setIsBottomBannerHidden] = useState(false)
  const [isSidebarHidden, setIsSidebarHidden] = useState(false)

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
      setDetectedDialect('')
      return
    }
    try {
      const result = formatWithRules(inputSql, rules)
      const finalSql = applyReplaceRules(result.sql, customRules)
      setOutputSql(finalSql)
      setDetectedDialect(result.detectedDialectLabel)
    } catch (error) {
      setOutputSql(
        `포매팅 오류: ${error instanceof Error ? error.message : '알 수 없는 오류'}`
      )
      setDetectedDialect('')
    }
  }, [inputSql, rules, customRules])

  const handleFormat = () => runFormat()

  useEffect(() => {
    if (!inputSql.trim()) return
    try {
      const result = formatWithRules(inputSql, rules)
      const finalSql = applyReplaceRules(result.sql, customRules)
      setOutputSql(finalSql)
      setDetectedDialect(result.detectedDialectLabel)
    } catch (error) {
      setOutputSql(
        `포매팅 오류: ${error instanceof Error ? error.message : '알 수 없는 오류'}`
      )
      setDetectedDialect('')
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

  const toggleTopBanner = () => setIsTopBannerHidden(!isTopBannerHidden)
  const toggleBottomBanner = () => setIsBottomBannerHidden(!isBottomBannerHidden)
  const toggleSidebar = () => setIsSidebarHidden(!isSidebarHidden)

  return (
    <div className="app">
      <Banner position='top' isHidden={isTopBannerHidden} onToggleHide={toggleTopBanner} />
      <div className={`main-content ${isTopBannerHidden ? 'banner-hidden' : ''} ${isSidebarHidden ? 'sidebar-hidden' : ''}`}>
        <Sidebar
          rules={rules}
          onRulesChange={setRules}
          customRules={customRules}
          onCustomRulesChange={setCustomRules}
          aiProvider={aiProvider}
          apiKey={apiKey}
          onAiProviderChange={setAiProvider}
          onApiKeyChange={handleApiKeyChange}
          onSaveApiKey={handleSaveApiKey}
          onClearApiKey={handleClearApiKey}
          onRequestAi={handleRequestAi}
          aiLoading={aiLoading}
          keySaved={keySaved}
          isHidden={isSidebarHidden}
          onToggle={toggleSidebar}
        />
        <EditorContainer
          inputSql={inputSql}
          onInputChange={setInputSql}
          outputSql={outputSql}
          onOutputChange={setOutputSql}
          onFormat={handleFormat}
          detectedDialect={detectedDialect}
        />
      </div>
      <Banner position='bottom' isHidden={isBottomBannerHidden} onToggleHide={toggleBottomBanner} />
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
