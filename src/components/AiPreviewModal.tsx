import './AiPreviewModal.css'

interface AiPreviewModalProps {
  before: string
  after: string
  onApply: () => void
  onCancel: () => void
}

export default function AiPreviewModal({ before, after, onApply, onCancel }: AiPreviewModalProps) {
  return (
    <div className="ai-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="ai-modal-title">
      <div className="ai-modal">
        <h2 id="ai-modal-title" className="ai-modal-title">AI 포맷 결과 미리보기</h2>
        <p className="ai-modal-desc">변경 전/후를 확인한 뒤 적용하거나 취소할 수 있습니다.</p>

        <div className="ai-modal-compare">
          <div className="ai-modal-block">
            <h3 className="ai-modal-label">변경 전</h3>
            <pre className="ai-modal-code">{before || '(비어 있음)'}</pre>
          </div>
          <div className="ai-modal-block">
            <h3 className="ai-modal-label">변경 후 (AI 제안)</h3>
            <pre className="ai-modal-code">{after || '(비어 있음)'}</pre>
          </div>
        </div>

        <div className="ai-modal-actions">
          <button type="button" className="ai-modal-btn ai-modal-cancel" onClick={onCancel}>
            취소
          </button>
          <button type="button" className="ai-modal-btn ai-modal-apply" onClick={onApply}>
            Output에 적용
          </button>
        </div>
      </div>
    </div>
  )
}
