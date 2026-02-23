import { useState } from 'react'
import type { ReplaceRuleItem, ReplaceRuleType } from '../types/customRules'
import { createReplaceRule } from '../types/customRules'
import './TemplatePanel.css'

interface TemplatePanelProps {
  rules: ReplaceRuleItem[]
  onChange: (rules: ReplaceRuleItem[]) => void
}

export default function TemplatePanel({ rules, onChange }: TemplatePanelProps) {
  const [type, setType] = useState<ReplaceRuleType>('text')
  const [find, setFind] = useState('')
  const [replace, setReplace] = useState('')

  const addRule = () => {
    if (!find.trim()) return
    onChange([...rules, createReplaceRule({ type, find: find.trim(), replace: replace.trim(), enabled: true })])
    setFind('')
    setReplace('')
  }

  const updateRule = (id: string, patch: Partial<ReplaceRuleItem>) => {
    onChange(
      rules.map((r) => (r.id === id ? { ...r, ...patch } : r))
    )
  }

  const removeRule = (id: string) => {
    onChange(rules.filter((r) => r.id !== id))
  }

  return (
    <aside className="template-panel">
      <h2 className="template-panel-title">사용자 정의 템플릿</h2>
      <p className="template-panel-desc">텍스트 또는 정규식으로 찾아 바꾸기. 정렬 후 적용됩니다.</p>

      <section className="template-form">
        <div className="template-form-row">
          <label>유형</label>
          <select value={type} onChange={(e) => setType(e.target.value as ReplaceRuleType)}>
            <option value="text">텍스트</option>
            <option value="regex">정규식 (Regex)</option>
          </select>
        </div>
        <div className="template-form-row">
          <label>찾을 문자열</label>
          <input
            type="text"
            value={find}
            onChange={(e) => setFind(e.target.value)}
            placeholder={type === 'regex' ? '예: \\bISNULL\\b' : '예: ISNULL'}
            spellCheck={false}
          />
        </div>
        <div className="template-form-row">
          <label>바꿀 문자열</label>
          <input
            type="text"
            value={replace}
            onChange={(e) => setReplace(e.target.value)}
            placeholder="예: COALESCE"
            spellCheck={false}
          />
        </div>
        <button type="button" className="template-add-btn" onClick={addRule} disabled={!find.trim()}>
          규칙 추가
        </button>
      </section>

      <section className="template-list">
        <h3 className="template-list-title">적용 순서 (위 → 아래)</h3>
        {rules.length === 0 ? (
          <p className="template-list-empty">추가된 규칙이 없습니다.</p>
        ) : (
          <ul className="template-list-ul">
            {rules.map((rule) => (
              <li key={rule.id} className="template-list-item">
                <input
                  type="checkbox"
                  checked={rule.enabled}
                  onChange={(e) => updateRule(rule.id, { enabled: e.target.checked })}
                  className="template-item-check"
                  title="사용 여부"
                />
                <span className="template-item-type">{rule.type === 'regex' ? 'Regex' : 'Text'}</span>
                <span className="template-item-find" title={rule.find}>
                  {rule.find || '(비어 있음)'}
                </span>
                <span className="template-item-arrow">→</span>
                <span className="template-item-replace" title={rule.replace}>
                  {rule.replace || '(비어 있음)'}
                </span>
                <button
                  type="button"
                  className="template-item-remove"
                  onClick={() => removeRule(rule.id)}
                  title="삭제"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </aside>
  )
}
