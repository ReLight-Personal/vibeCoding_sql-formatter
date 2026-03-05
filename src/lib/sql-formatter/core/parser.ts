import type { SqlToken } from '../types/token'

export interface AstNode {
  type: string
  tokens: SqlToken[]
  children?: AstNode[]
  value?: string
}

export class SqlParser {
  parse(tokens: SqlToken[]): AstNode[] {
    const nodes: AstNode[] = []
    let currentIndex = 0

    while (currentIndex < tokens.length) {
      const node = this.parseStatement(tokens, currentIndex)
      if (node) {
        nodes.push(node.node)
        currentIndex = node.nextIndex
      } else {
        currentIndex++
      }
    }

    return nodes
  }

  private parseStatement(tokens: SqlToken[], startIndex: number): { node: AstNode; nextIndex: number } | null {
    const token = tokens[startIndex]
    if (!token) return null

    // SELECT 문 파싱
    if (token.type === 'keyword' && token.value.toUpperCase() === 'SELECT') {
      return this.parseSelectStatement(tokens, startIndex)
    }

    // INSERT 문 파싱
    if (token.type === 'keyword' && token.value.toUpperCase() === 'INSERT') {
      return this.parseInsertStatement(tokens, startIndex)
    }

    // UPDATE 문 파싱
    if (token.type === 'keyword' && token.value.toUpperCase() === 'UPDATE') {
      return this.parseUpdateStatement(tokens, startIndex)
    }

    // DELETE 문 파싱
    if (token.type === 'keyword' && token.value.toUpperCase() === 'DELETE') {
      return this.parseDeleteStatement(tokens, startIndex)
    }

    // CREATE 문 파싱
    if (token.type === 'keyword' && token.value.toUpperCase() === 'CREATE') {
      return this.parseCreateStatement(tokens, startIndex)
    }

    // 기본 문장 (세미콜론까지)
    return this.parseGenericStatement(tokens, startIndex)
  }

  private parseSelectStatement(tokens: SqlToken[], startIndex: number): { node: AstNode; nextIndex: number } {
    const node: AstNode = {
      type: 'select_statement',
      tokens: []
    }

    let currentIndex = startIndex

    // SELECT 키워드
    node.tokens.push(tokens[currentIndex])
    currentIndex++

    // SELECT 절 파싱
    const selectClause = this.parseSelectClause(tokens, currentIndex)
    if (selectClause) {
      node.children = node.children || []
      node.children.push(selectClause.node)
      currentIndex = selectClause.nextIndex
    }

    // FROM 절 파싱
    const fromClause = this.parseFromClause(tokens, currentIndex)
    if (fromClause) {
      node.children = node.children || []
      node.children.push(fromClause.node)
      currentIndex = fromClause.nextIndex
    }

    // WHERE 절 파싱
    const whereClause = this.parseWhereClause(tokens, currentIndex)
    if (whereClause) {
      node.children = node.children || []
      node.children.push(whereClause.node)
      currentIndex = whereClause.nextIndex
    }

    // GROUP BY 절 파싱
    const groupByClause = this.parseGroupByClause()
    if (groupByClause) {
      node.children = node.children || []
      node.children.push(groupByClause.node)
      currentIndex = groupByClause.nextIndex
    }

    // ORDER BY 절 파싱
    const orderByClause = this.parseOrderByClause()
    if (orderByClause) {
      node.children = node.children || []
      node.children.push(orderByClause.node)
      currentIndex = orderByClause.nextIndex
    }

    // 세미콜론까지 포함
    while (currentIndex < tokens.length) {
      node.tokens.push(tokens[currentIndex])
      if (tokens[currentIndex].type === 'semicolon') {
        currentIndex++
        break
      }
      currentIndex++
    }

    return { node, nextIndex: currentIndex }
  }

  private parseSelectClause(tokens: SqlToken[], startIndex: number): { node: AstNode; nextIndex: number } | null {
    const node: AstNode = {
      type: 'select_clause',
      tokens: []
    }

    let currentIndex = startIndex
    let depth = 0

    while (currentIndex < tokens.length) {
      const token = tokens[currentIndex]
      node.tokens.push(token)

      // 괄호 깊이 추적
      if (token.type === 'parenthesis' && token.value === '(') depth++
      if (token.type === 'parenthesis' && token.value === ')') depth--

      // FROM 키워드를 만나고 괄호 밖에 있으면 종료
      if (depth === 0 && token.type === 'keyword' && token.value.toUpperCase() === 'FROM') {
        node.tokens.pop() // FROM 토큰은 제외
        break
      }

      currentIndex++
    }

    return node.tokens.length > 0 ? { node, nextIndex: currentIndex } : null
  }

  private parseFromClause(tokens: SqlToken[], startIndex: number): { node: AstNode; nextIndex: number } | null {
    const node: AstNode = {
      type: 'from_clause',
      tokens: []
    }

    let currentIndex = startIndex

    // FROM 키워드 확인
    if (tokens[currentIndex]?.type === 'keyword' && tokens[currentIndex].value.toUpperCase() === 'FROM') {
      node.tokens.push(tokens[currentIndex])
      currentIndex++
    }

    // FROM 절 내용 파싱
    while (currentIndex < tokens.length) {
      const token = tokens[currentIndex]
      node.tokens.push(token)

      // WHERE, GROUP BY, ORDER BY, 세미콜론을 만나면 종료
      if (token.type === 'keyword') {
        const upperValue = token.value.toUpperCase()
        if (['WHERE', 'GROUP', 'ORDER', 'LIMIT'].includes(upperValue)) {
          node.tokens.pop() // 현재 키워드는 제외
          break
        }
      }

      if (token.type === 'semicolon') {
        node.tokens.pop() // 세미콜론은 제외
        break
      }

      currentIndex++
    }

    return node.tokens.length > 1 ? { node, nextIndex: currentIndex } : null
  }

  private parseWhereClause(tokens: SqlToken[], startIndex: number): { node: AstNode; nextIndex: number } | null {
    const node: AstNode = {
      type: 'where_clause',
      tokens: []
    }

    let currentIndex = startIndex

    // WHERE 키워드 확인
    if (tokens[currentIndex]?.type === 'keyword' && tokens[currentIndex].value.toUpperCase() === 'WHERE') {
      node.tokens.push(tokens[currentIndex])
      currentIndex++
    }

    // WHERE 절 내용 파싱
    while (currentIndex < tokens.length) {
      const token = tokens[currentIndex]
      node.tokens.push(token)

      // GROUP BY, ORDER BY, LIMIT, 세미콜론을 만나면 종료
      if (token.type === 'keyword') {
        const upperValue = token.value.toUpperCase()
        if (['GROUP', 'ORDER', 'LIMIT'].includes(upperValue)) {
          node.tokens.pop() // 현재 키워드는 제외
          break
        }
      }

      if (token.type === 'semicolon') {
        node.tokens.pop() // 세미콜론은 제외
        break
      }

      currentIndex++
    }

    return node.tokens.length > 1 ? { node, nextIndex: currentIndex } : null
  }

  private parseGroupByClause(): { node: AstNode; nextIndex: number } | null {
    // TODO: GROUP BY 절 파싱 구현
    return null
  }

  private parseOrderByClause(): { node: AstNode; nextIndex: number } | null {
    // TODO: ORDER BY 절 파싱 구현
    return null
  }

  private parseInsertStatement(tokens: SqlToken[], startIndex: number): { node: AstNode; nextIndex: number } {
    // INSERT 문 파싱 로직
    return this.parseGenericStatement(tokens, startIndex)
  }

  private parseUpdateStatement(tokens: SqlToken[], startIndex: number): { node: AstNode; nextIndex: number } {
    // UPDATE 문 파싱 로직
    return this.parseGenericStatement(tokens, startIndex)
  }

  private parseDeleteStatement(tokens: SqlToken[], startIndex: number): { node: AstNode; nextIndex: number } {
    // DELETE 문 파싱 로직
    return this.parseGenericStatement(tokens, startIndex)
  }

  private parseCreateStatement(tokens: SqlToken[], startIndex: number): { node: AstNode; nextIndex: number } {
    // CREATE 문 파싱 로직
    return this.parseGenericStatement(tokens, startIndex)
  }

  private parseGenericStatement(tokens: SqlToken[], startIndex: number): { node: AstNode; nextIndex: number } {
    const node: AstNode = {
      type: 'generic_statement',
      tokens: []
    }

    let currentIndex = startIndex

    while (currentIndex < tokens.length) {
      node.tokens.push(tokens[currentIndex])
      if (tokens[currentIndex].type === 'semicolon') {
        currentIndex++
        break
      }
      currentIndex++
    }

    return { node, nextIndex: currentIndex }
  }
}
