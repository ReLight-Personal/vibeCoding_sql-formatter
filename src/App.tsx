import { useState, useEffect, useCallback } from 'react'
import './App.css'
import Banner from './components/Banner'
import EditorPanel from './components/EditorPanel'
import RulePanel from './components/RulePanel'
import TemplatePanel from './components/TemplatePanel'
import { formatWithRules } from './utils/formatSql'
import { applyReplaceRules } from './utils/applyReplaceRules'
import { loadFormatRules, saveFormatRules, loadCustomRules, saveCustomRules } from './utils/storage'
import { defaultFormatRules, type FormatRulesState } from './types/formatRules'
import type { ReplaceRuleItem } from './types/customRules'

function App() {
  const [inputSql, setInputSql] = useState('')
  const [outputSql, setOutputSql] = useState('')
  const [rules, setRules] = useState<FormatRulesState>(() => loadFormatRules() ?? defaultFormatRules)
  const [customRules, setCustomRules] = useState<ReplaceRuleItem[]>(() => loadCustomRules() ?? [])

  // LocalStorage에 포맷 규칙 저장
  useEffect(() => {
    saveFormatRules(rules)
  }, [rules])

  // LocalStorage에 사용자 정의 규칙 저장
  useEffect(() => {
    saveCustomRules(customRules)
  }, [customRules])

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

  // 규칙 변경 시에만 Output 재반영 (Input 변경 시에는 버튼으로 포맷)
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

  return (
    <div className="app">
      <Banner />
      <div className="main-content">
        <div className="sidebar">
          <RulePanel rules={rules} onChange={setRules} />
          <TemplatePanel rules={customRules} onChange={setCustomRules} />
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
    </div>
  )
}

export default App
