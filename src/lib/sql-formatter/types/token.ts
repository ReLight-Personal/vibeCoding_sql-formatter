export type TokenType = 
  | 'keyword'
  | 'identifier'
  | 'operator'
  | 'string'
  | 'number'
  | 'comment'
  | 'whitespace'
  | 'semicolon'
  | 'comma'
  | 'parenthesis'
  | 'bracket'
  | 'dot'

export interface Position {
  line: number
  column: number
  offset: number
}

export interface SqlToken {
  type: TokenType
  value: string
  position: Position
  originalCase?: string // 원본 대소문자 보존용
}

export interface TokenPattern {
  type: TokenType
  pattern: RegExp
  priority?: number // 높을수록 우선 매칭
}
