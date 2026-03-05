import type { SqlToken, TokenType, TokenPattern } from '../types/token'

export class SqlTokenizer {
  private patterns: TokenPattern[] = [
    // 문자열 (작은따옴표, 큰따옴표)
    { type: 'string', pattern: /'(?:[^']|'')*'/g },
    { type: 'string', pattern: /"(?:[^"]|"")*"/g },
    
    // 숫자
    { type: 'number', pattern: /\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b/g },
    
    // 주석
    { type: 'comment', pattern: /--.*$/gm },
    { type: 'comment', pattern: /\/\*[\s\S]*?\*\//g },
    
    // 세미콜론
    { type: 'semicolon', pattern: /;/g },
    
    // 콤마
    { type: 'comma', pattern: /,/g },
    
    // 괄호
    { type: 'parenthesis', pattern: /[()]/g },
    
    // 대괄호
    { type: 'bracket', pattern: /[[]]/g },
    
    // 점
    { type: 'dot', pattern: /\./g },
    
    // 연산자 (우선순위 높음)
    { type: 'operator', pattern: /(?:<=|>=|<>|!=|==|\|\||&&|=|<|>|\+|-|\*|\/|%|!|~|\||&|\^)/g },
    
    // 공백 (가장 낮은 우선순위)
    { type: 'whitespace', pattern: /\s+/g },
  ]

  // 기본 SQL 키워드
  private keywords = new Set([
    // DDL
    'CREATE', 'ALTER', 'DROP', 'TRUNCATE', 'RENAME',
    // DML
    'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'MERGE',
    'INTO', 'VALUES', 'SET', 'FROM', 'WHERE', 'GROUP', 'HAVING', 'ORDER',
    // DCL
    'GRANT', 'REVOKE', 'COMMIT', 'ROLLBACK', 'SAVEPOINT',
    // 조인
    'JOIN', 'INNER', 'LEFT', 'RIGHT', 'FULL', 'OUTER', 'ON', 'USING',
    // 함수
    'COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'DISTINCT',
    // 조건
    'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'IF', 'COALESCE', 'NULLIF',
    // 데이터 타입
    'NULL', 'TRUE', 'FALSE',
    // 기타
    'AS', 'AND', 'OR', 'NOT', 'IN', 'EXISTS', 'BETWEEN', 'LIKE', 'IS',
    'UNION', 'INTERSECT', 'EXCEPT', 'WITH', 'RECURSIVE',
  ])

  tokenize(input: string): SqlToken[] {
    const tokens: SqlToken[] = []
    let position = 0
    let line = 1
    let column = 1

    while (position < input.length) {
      let matched = false

      // 패턴 순서대로 매칭 시도
      for (const pattern of this.patterns) {
        pattern.pattern.lastIndex = 0 // RegExp 상태 초기화
        const match = pattern.pattern.exec(input.slice(position))
        
        if (match && match.index === 0) {
          const value = match[0]
          const token: SqlToken = {
            type: pattern.type,
            value,
            position: { line, column, offset: position },
            originalCase: value
          }

          // 키워드 식별자 처리
          if (pattern.type === 'whitespace') {
            // 공백은 별도 처리
          } else if (this.isKeyword(value)) {
            token.type = 'keyword'
          } else if (this.isIdentifier(value)) {
            token.type = 'identifier'
          }

          tokens.push(token)

          // 위치 업데이트
          const lines = value.split('\n')
          if (lines.length > 1) {
            line += lines.length - 1
            column = lines[lines.length - 1].length + 1
          } else {
            column += value.length
          }

          position += value.length
          matched = true
          break
        }
      }

      if (!matched) {
        // 매칭되지 않는 문자는 식별자로 처리
        const char = input[position]
        tokens.push({
          type: 'identifier',
          value: char,
          position: { line, column, offset: position }
        })
        position++
        column++
      }
    }

    return tokens
  }

  private isKeyword(value: string): boolean {
    return this.keywords.has(value.toUpperCase())
  }

  private isIdentifier(value: string): boolean {
    // 따옴표로 감싸지 않은 식별자 규칙
    return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)
  }

  // 토큰 필터링 유틸리티
  filterTokens(tokens: SqlToken[], types: TokenType[]): SqlToken[] {
    return tokens.filter(token => types.includes(token.type))
  }

  // 키워드 토큰만 추출
  getKeywordTokens(tokens: SqlToken[]): SqlToken[] {
    return this.filterTokens(tokens, ['keyword'])
  }

  // 식별자 토큰만 추출
  getIdentifierTokens(tokens: SqlToken[]): SqlToken[] {
    return this.filterTokens(tokens, ['identifier'])
  }

  // 공백 제거 토큰
  getNonWhitespaceTokens(tokens: SqlToken[]): SqlToken[] {
    return this.filterTokens(tokens, ['whitespace'])
  }
}
