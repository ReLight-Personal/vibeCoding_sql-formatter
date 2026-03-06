import { Button } from './ui/button'
import EditorPanel from './EditorPanel'
import './EditorContainer.css'

interface EditorContainerProps {
  inputSql: string
  onInputChange: (value: string) => void
  outputSql: string
  onOutputChange: (value: string) => void
  onFormat: () => void
  detectedDialect?: string
}

export default function EditorContainer({
  inputSql,
  onInputChange,
  outputSql,
  onOutputChange,
  onFormat,
  detectedDialect,
}: EditorContainerProps) {
  return (
    <div className="editor-container">
      <EditorPanel
        title="Input"
        value={inputSql}
        onChange={onInputChange}
        placeholder="SQL 쿼리를 입력하세요..."
        badge={detectedDialect}
      />
      <div className="divider">
        <Button onClick={onFormat}>정렬하기 →</Button>
      </div>
      <EditorPanel
        title="Output"
        value={outputSql}
        onChange={onOutputChange}
        placeholder="정렬된 결과가 여기에 표시됩니다..."
        readOnly
      />
    </div>
  )
}
