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
  | 'mybatis_tag'    // MyBatis XML 태그: <if>, <where> 등
  | 'mybatis_param'  // MyBatis 파라미터: #{param}, ${param}
  | 'placeholder'    // 추출된 태그를 대체하는 내부 플레이스홀더

export interface Position {
  line: number
  column: number
  offset: number
}

export interface SqlToken {
  type: TokenType
  value: string
  position: Position
  originalCase?: string
}

export interface TokenPattern {
  type: TokenType
  pattern: RegExp
  priority?: number
}
