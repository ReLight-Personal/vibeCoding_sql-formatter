import type { SqlToken, TokenType, TokenPattern } from '../types/token'

export class SqlTokenizer {
  // 패턴 순서가 우선순위 — 위에 있을수록 먼저 매칭
  private patterns: TokenPattern[] = [
    // MyBatis 파라미터: #{param}, ${param}
    { type: 'mybatis_param', pattern: /[#$]\{[^}]*\}/g },

    // MyBatis XML 태그 (self-closing 포함)
    { type: 'mybatis_tag', pattern: /<\/?(?:if|where|set|foreach|choose|when|otherwise|trim|bind|include|sql|mapper|resultMap|select|insert|update|delete)(?:\s[^>]*)?\/?>/gi },

    // 블록 주석
    { type: 'comment', pattern: /\/\*[\s\S]*?\*\//g },

    // 라인 주석
    { type: 'comment', pattern: /--[^\n]*/g },

    // 문자열 (작은따옴표, 이스케이프 처리)
    { type: 'string', pattern: /'(?:[^'\\]|\\.)*(?:''[^']*)*'/g },

    // 문자열 (큰따옴표 — quoted identifier 겸용)
    { type: 'string', pattern: /"(?:[^"\\]|\\.)*"/g },

    // 백틱 식별자 (MySQL)
    { type: 'identifier', pattern: /`[^`]*`/g },

    // 숫자 (정수, 소수, 지수)
    { type: 'number', pattern: /\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b/g },

    // 세미콜론
    { type: 'semicolon', pattern: /;/g },

    // 콤마
    { type: 'comma', pattern: /,/g },

    // 괄호
    { type: 'parenthesis', pattern: /[()]/g },

    // 대괄호
    { type: 'bracket', pattern: /[\[\]]/g },

    // 점
    { type: 'dot', pattern: /\./g },

    // 연산자 (복합 연산자 우선)
    { type: 'operator', pattern: /(?:<=|>=|<>|!=|::|==|\|\||&&|->|=>|=|<|>|\+|-|\*|\/|%|!|~|\||&|\^)/g },

    // 공백 (줄바꿈 포함)
    { type: 'whitespace', pattern: /\s+/g },
  ]

  // SQL 키워드 세트 (방언 공통 + 확장)
  private keywords = new Set([
    // DDL
    'CREATE', 'ALTER', 'DROP', 'TRUNCATE', 'RENAME', 'TABLE', 'VIEW',
    'INDEX', 'SEQUENCE', 'PROCEDURE', 'FUNCTION', 'TRIGGER', 'PACKAGE',
    'DATABASE', 'SCHEMA', 'TABLESPACE', 'COLUMN', 'CONSTRAINT',
    'PRIMARY', 'FOREIGN', 'KEY', 'REFERENCES', 'UNIQUE', 'CHECK',
    'DEFAULT', 'TEMPORARY', 'TEMP', 'IF', 'EXISTS',
    // DML
    'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'MERGE', 'REPLACE',
    'INTO', 'VALUES', 'SET', 'FROM', 'WHERE', 'GROUP', 'HAVING',
    'ORDER', 'BY', 'LIMIT', 'OFFSET', 'FETCH', 'NEXT', 'ROWS', 'ONLY',
    'RETURNING',
    // JOIN
    'JOIN', 'INNER', 'LEFT', 'RIGHT', 'FULL', 'OUTER', 'CROSS',
    'NATURAL', 'ON', 'USING',
    // 집합 연산
    'UNION', 'INTERSECT', 'EXCEPT', 'ALL',
    // CTE
    'WITH', 'RECURSIVE', 'AS',
    // DCL
    'GRANT', 'REVOKE', 'COMMIT', 'ROLLBACK', 'SAVEPOINT', 'BEGIN',
    'TRANSACTION', 'START',
    // 집계
    'COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'DISTINCT', 'OVER',
    'PARTITION', 'ROWS', 'RANGE', 'PRECEDING', 'FOLLOWING', 'UNBOUNDED',
    'CURRENT', 'ROW',
    // 조건
    'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'COALESCE', 'NULLIF',
    'IIF', 'DECODE',
    // 데이터 타입
    'NULL', 'TRUE', 'FALSE', 'NOT', 'UNKNOWN',
    // 논리
    'AND', 'OR', 'NOT', 'IN', 'EXISTS', 'BETWEEN', 'LIKE', 'ILIKE',
    'IS', 'ANY', 'SOME', 'ALL',
    // PL/SQL
    'DECLARE', 'BEGIN', 'END', 'EXCEPTION', 'RAISE', 'LOOP',
    'WHILE', 'FOR', 'CURSOR', 'OPEN', 'CLOSE', 'FETCH', 'EXIT',
    'CONTINUE', 'RETURN', 'GOTO', 'TYPE', 'RECORD', 'ROWTYPE',
    // T-SQL
    'TOP', 'IDENTITY', 'SCOPE_IDENTITY', 'OUTPUT', 'EXEC', 'EXECUTE',
    'PRINT', 'GO', 'USE', 'NOCOUNT', 'NOLOCK', 'UPDLOCK',
    // MySQL
    'AUTO_INCREMENT', 'UNSIGNED', 'ZEROFILL', 'ENUM', 'SHOW',
    'DESCRIBE', 'EXPLAIN', 'ENGINE', 'CHARSET',
    // PostgreSQL
    'SERIAL', 'BIGSERIAL', 'RETURNING', 'ILIKE', 'SIMILAR',
    'EXCLUDE', 'DO', 'LANGUAGE', 'PLPGSQL',
  ])

  tokenize(input: string): SqlToken[] {
    const tokens: SqlToken[] = []
    let position = 0
    let line = 1
    let column = 1

    while (position < input.length) {
      let matched = false

      for (const patternDef of this.patterns) {
        // RegExp 상태 초기화 (global flag 부작용 방지)
        patternDef.pattern.lastIndex = 0
        const slice = input.slice(position)
        const match = patternDef.pattern.exec(slice)

        if (match && match.index === 0) {
          const rawValue = match[0]
          let tokenType: TokenType = patternDef.type

          // 공백이 아닌 경우 keyword/identifier 판별
          if (tokenType !== 'whitespace'
            && tokenType !== 'string'
            && tokenType !== 'number'
            && tokenType !== 'comment'
            && tokenType !== 'mybatis_tag'
            && tokenType !== 'mybatis_param'
            && tokenType !== 'semicolon'
            && tokenType !== 'comma'
            && tokenType !== 'parenthesis'
            && tokenType !== 'bracket'
            && tokenType !== 'dot'
            && tokenType !== 'operator'
          ) {
            // identifier 패턴이나 fallback identifier
            if (this.isKeyword(rawValue)) {
              tokenType = 'keyword'
            } else {
              tokenType = 'identifier'
            }
          } else if (tokenType === 'identifier') {
            // 백틱 식별자 — 그대로 identifier 유지
          } else if (
            tokenType !== 'whitespace'
            && tokenType !== 'string'
            && tokenType !== 'number'
            && tokenType !== 'comment'
            && tokenType !== 'mybatis_tag'
            && tokenType !== 'mybatis_param'
          ) {
            // operator, semicolon 등은 그대로
          }

          const token: SqlToken = {
            type: tokenType,
            value: rawValue,
            position: { line, column, offset: position },
            originalCase: rawValue,
          }

          tokens.push(token)

          // 위치 업데이트
          const lines = rawValue.split('\n')
          if (lines.length > 1) {
            line += lines.length - 1
            column = lines[lines.length - 1].length + 1
          } else {
            column += rawValue.length
          }

          position += rawValue.length
          matched = true
          break
        }
      }

      if (!matched) {
        // 매칭 안 된 문자 — identifier로 처리
        const char = input[position]
        const isKw = this.isKeyword(char)
        tokens.push({
          type: isKw ? 'keyword' : 'identifier',
          value: char,
          position: { line, column, offset: position },
          originalCase: char,
        })
        position++
        column++
      }
    }

    // 연속된 identifier 토큰을 하나로 합치는 후처리
    return this.mergeIdentifiers(tokens)
  }

  /**
   * 연속된 identifier 문자들을 하나의 identifier 토큰으로 합침
   * (패턴 매칭이 문자 단위로 쪼개지는 경우 방어)
   */
  private mergeIdentifiers(tokens: SqlToken[]): SqlToken[] {
    const result: SqlToken[] = []
    let i = 0

    while (i < tokens.length) {
      const token = tokens[i]

      if (token.type === 'identifier') {
        // 다음 토큰도 identifier면 합침 (공백 없이 연속된 경우)
        let merged = token.value
        let j = i + 1
        while (
          j < tokens.length &&
          tokens[j].type === 'identifier' &&
          tokens[j].position.offset === tokens[i].position.offset + merged.length
        ) {
          merged += tokens[j].value
          j++
        }

        // 합쳐진 결과가 keyword인지 재판별
        const finalType: TokenType = this.isKeyword(merged) ? 'keyword' : 'identifier'
        result.push({
          type: finalType,
          value: merged,
          position: token.position,
          originalCase: merged,
        })
        i = j
      } else {
        result.push(token)
        i++
      }
    }

    return result
  }

  isKeyword(value: string): boolean {
    return this.keywords.has(value.toUpperCase())
  }

  isIdentifier(value: string): boolean {
    return /^[a-zA-Z_][a-zA-Z0-9_$]*$/.test(value)
  }

  filterTokens(tokens: SqlToken[], types: TokenType[]): SqlToken[] {
    return tokens.filter(t => types.includes(t.type))
  }

  getKeywordTokens(tokens: SqlToken[]): SqlToken[] {
    return this.filterTokens(tokens, ['keyword'])
  }

  getIdentifierTokens(tokens: SqlToken[]): SqlToken[] {
    return this.filterTokens(tokens, ['identifier'])
  }

  getNonWhitespaceTokens(tokens: SqlToken[]): SqlToken[] {
    return tokens.filter(t => t.type !== 'whitespace')
  }
}
