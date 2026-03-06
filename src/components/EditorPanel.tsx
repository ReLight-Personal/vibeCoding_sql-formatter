import './EditorPanel.css'
import { Textarea } from './ui/textarea'

interface EditorPanelProps {
  title: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  readOnly?: boolean
  badge?: string
}

const EditorPanel = ({
  title,
  value,
  onChange,
  placeholder,
  readOnly = false,
  badge,
}: EditorPanelProps) => {
  return (
    <div className="editor-panel">
      <div className="editor-header">
        <h2 className="editor-title">{title}</h2>
        {badge && <span className="editor-dialect-badge">{badge}</span>}
      </div>
      <Textarea
        className="editor-textarea"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        readOnly={readOnly}
        spellCheck={false}
      />
    </div>
  )
}

export default EditorPanel
