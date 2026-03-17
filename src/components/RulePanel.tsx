import type { FormatRulesState } from '../types/formatRules'
import './RulePanel.css'

interface RulePanelProps {
  rules: FormatRulesState
  onChange: (rules: FormatRulesState) => void
}

export default function RulePanel({ rules, onChange }: RulePanelProps) {
  const update = (patch: Partial<FormatRulesState>) => {
    onChange({ ...rules, ...patch })
  }

  return (
    <aside className="rule-panel">
      <h2 className="rule-panel-title">규칙 제어</h2>

      <section className="rule-section">
        <div className="rule-row rule-toggle">
          <input
            type="checkbox"
            id="keywordCaseEnabled"
            checked={rules.keywordCaseEnabled}
            onChange={(e) => update({ keywordCaseEnabled: e.target.checked })}
          />
          <label htmlFor="keywordCaseEnabled">예약어 대소문자</label>
        </div>
        {rules.keywordCaseEnabled && (
          <div className="rule-options">
            <label className="radio-label">
              <input
                type="radio"
                name="keywordCase"
                checked={rules.keywordCase === 'upper'}
                onChange={() => update({ keywordCase: 'upper' })}
              />
              대문자
            </label>
            <label className="radio-label">
              <input
                type="radio"
                name="keywordCase"
                checked={rules.keywordCase === 'lower'}
                onChange={() => update({ keywordCase: 'lower' })}
              />
              소문자
            </label>
            <label className="radio-label">
              <input
                type="radio"
                name="keywordCase"
                checked={rules.keywordCase === 'preserve'}
                onChange={() => update({ keywordCase: 'preserve' })}
              />
              유지
            </label>
          </div>
        )}
      </section>

      <section className="rule-section">
        <div className="rule-row rule-toggle">
          <input
            type="checkbox"
            id="commaPositionEnabled"
            checked={rules.commaPositionEnabled}
            onChange={(e) => update({ commaPositionEnabled: e.target.checked })}
          />
          <label htmlFor="commaPositionEnabled">콤마 위치</label>
        </div>
        {rules.commaPositionEnabled && (
          <div className="rule-options">
            <label className="radio-label">
              <input
                type="radio"
                name="commaPosition"
                checked={rules.commaPosition === 'leading'}
                onChange={() => update({ commaPosition: 'leading' })}
              />
              앞(Leading)
            </label>
            <label className="radio-label">
              <input
                type="radio"
                name="commaPosition"
                checked={rules.commaPosition === 'trailing'}
                onChange={() => update({ commaPosition: 'trailing' })}
              />
              뒤(Trailing)
            </label>
          </div>
        )}
      </section>

      <section className="rule-section">
        <div className="rule-row rule-toggle">
          <input
            type="checkbox"
            id="indentEnabled"
            checked={rules.indentEnabled}
            onChange={(e) => update({ indentEnabled: e.target.checked })}
          />
          <label htmlFor="indentEnabled">들여쓰기</label>
        </div>
        {rules.indentEnabled && (
          <div className="rule-options">
            <label className="radio-label">
              <input
                type="radio"
                name="indentType"
                checked={rules.indentType === 'spaces'}
                onChange={() => update({ indentType: 'spaces' })}
              />
              Space
            </label>
            <label className="radio-label">
              <input
                type="radio"
                name="indentType"
                checked={rules.indentType === 'tabs'}
                onChange={() => update({ indentType: 'tabs' })}
              />
              Tab
            </label>
            <label className="radio-label auto-label">
              <input
                type="radio"
                name="indentType"
                checked={rules.indentType === 'auto'}
                onChange={() => update({ indentType: 'auto' })}
              />
              자동
              <span className="auto-badge">AUTO</span>
            </label>
            {rules.indentType === 'spaces' && (
              <div className="rule-inline">
                <label htmlFor="tabWidth">칸 수</label>
                <select
                  id="tabWidth"
                  value={rules.tabWidth}
                  onChange={(e) => update({ tabWidth: Number(e.target.value) })}
                >
                  <option value={2}>2</option>
                  <option value={4}>4</option>
                </select>
              </div>
            )}
            {rules.indentType === 'auto' && (
              <div className="auto-desc">
                <p>키워드마다 줄바꿈 후,</p>
                <p>가장 긴 키워드 기준 정렬</p>
              </div>
            )}
          </div>
        )}
      </section>

      <section className="rule-section">
        <div className="rule-row rule-toggle">
          <input
            type="checkbox"
            id="operatorSpacingEnabled"
            checked={rules.operatorSpacingEnabled}
            onChange={(e) => update({ operatorSpacingEnabled: e.target.checked })}
          />
          <label htmlFor="operatorSpacingEnabled">연산자 공백</label>
        </div>
        {rules.operatorSpacingEnabled && (
          <div className="rule-options">
            <label className="radio-label">
              <input
                type="radio"
                name="denseOperators"
                checked={!rules.denseOperators}
                onChange={() => update({ denseOperators: false })}
              />
              공백 있음
            </label>
            <label className="radio-label">
              <input
                type="radio"
                name="denseOperators"
                checked={rules.denseOperators}
                onChange={() => update({ denseOperators: true })}
              />
              공백 없음(Dense)
            </label>
          </div>
        )}
      </section>
    </aside>
  )
}
