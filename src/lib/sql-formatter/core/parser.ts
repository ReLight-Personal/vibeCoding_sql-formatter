import type { SqlToken } from '../types/token'

export interface AstNode {
  type: string
  tokens: SqlToken[]
  children?: AstNode[]
  value?: string
}

type ParseResult = { node: AstNode; nextIndex: number } | null

// 절(Clause)을 구분하는 최상위 키워드 목록
const CLAUSE_TERMINATORS = new Set([
  'FROM', 'WHERE', 'GROUP', 'HAVING', 'ORDER', 'LIMIT', 'OFFSET',
  'UNION', 'INTERSECT', 'EXCEPT',
  'JOIN', 'INNER', 'LEFT', 'RIGHT', 'FULL', 'CROSS', 'NATURAL',
  'ON', 'USING',
  'FETCH', 'FOR',
])

export class SqlParser {
  parse(tokens: SqlToken[]): AstNode[] {
    const nodes: AstNode[] = []
    // 공백 제거
    const filtered = tokens.filter(t => t.type !== 'whitespace')
    let idx = 0

    while (idx < filtered.length) {
      const result = this.parseStatement(filtered, idx)
      if (result) {
        nodes.push(result.node)
        idx = result.nextIndex
      } else {
        idx++
      }
    }

    return nodes
  }

  // ─────────────────────────────────────────────────
  // Statement 분기
  // ─────────────────────────────────────────────────
  private parseStatement(tokens: SqlToken[], idx: number): ParseResult {
    const token = tokens[idx]
    if (!token) return null

    // comment 토큰과 MyBatis 플레이스홀더(CDATA_OPEN/CLOSE, TAG)는
    // statement로 처리하지 않고 단독 노드로 반환 → parse() 루프에서 건너뜀
    if (token.type === 'comment') {
      return {
        node: { type: 'comment_node', tokens: [token] },
        nextIndex: idx + 1,
      }
    }
    if (token.type === 'identifier' && /^__MYBATIS_(CDATA|TAG)_/.test(token.value)) {
      return {
        node: { type: 'mybatis_placeholder_node', tokens: [token] },
        nextIndex: idx + 1,
      }
    }

    const upper = token.value.toUpperCase()

    // CTE: WITH ... AS (...)
    if (upper === 'WITH') return this.parseCteStatement(tokens, idx)

    if (token.type === 'keyword') {
      switch (upper) {
        case 'SELECT': return this.parseSelectStatement(tokens, idx)
        case 'INSERT': return this.parseInsertStatement(tokens, idx)
        case 'UPDATE': return this.parseUpdateStatement(tokens, idx)
        case 'DELETE': return this.parseDeleteStatement(tokens, idx)
        case 'CREATE': return this.parseCreateStatement(tokens, idx)
        case 'ALTER':  return this.parseAlterStatement(tokens, idx)
        case 'DROP':   return this.parseDropStatement(tokens, idx)
        case 'DECLARE':return this.parseDeclareStatement(tokens, idx)
        case 'BEGIN':  return this.parseBlockStatement(tokens, idx)
        case 'MERGE':  return this.parseMergeStatement(tokens, idx)
      }
    }

    return this.parseGenericStatement(tokens, idx)
  }

  // ─────────────────────────────────────────────────
  // CTE: WITH name AS (subquery) [, name AS (...)]
  // ─────────────────────────────────────────────────
  private parseCteStatement(tokens: SqlToken[], startIdx: number): ParseResult {
    const node: AstNode = { type: 'cte_statement', tokens: [], children: [] }
    let idx = startIdx

    // WITH
    node.tokens.push(tokens[idx++])

    // 각 CTE 정의 수집
    while (idx < tokens.length) {
      const cteDef = this.parseCteDefinition(tokens, idx)
      if (!cteDef) break
      node.children!.push(cteDef.node)
      idx = cteDef.nextIndex

      // 콤마 → 다음 CTE
      if (idx < tokens.length && tokens[idx].type === 'comma') {
        node.tokens.push(tokens[idx++])
      } else {
        break
      }
    }

    // 이후 SELECT / INSERT / UPDATE / DELETE
    if (idx < tokens.length) {
      const mainResult = this.parseStatement(tokens, idx)
      if (mainResult) {
        node.children!.push(mainResult.node)
        idx = mainResult.nextIndex
      }
    }

    return { node, nextIndex: idx }
  }

  private parseCteDefinition(tokens: SqlToken[], startIdx: number): ParseResult {
    const node: AstNode = { type: 'cte_definition', tokens: [], children: [] }
    let idx = startIdx

    // name
    if (idx >= tokens.length) return null
    node.tokens.push(tokens[idx++])

    // RECURSIVE 옵션
    if (idx < tokens.length && tokens[idx].value.toUpperCase() === 'RECURSIVE') {
      node.tokens.push(tokens[idx++])
    }

    // AS
    if (idx < tokens.length && tokens[idx].value.toUpperCase() === 'AS') {
      node.tokens.push(tokens[idx++])
    }

    // ( subquery )
    if (idx < tokens.length && tokens[idx].value === '(') {
      const subResult = this.parseParenthesizedSubquery(tokens, idx)
      if (subResult) {
        node.children!.push(subResult.node)
        idx = subResult.nextIndex
      }
    }

    return { node, nextIndex: idx }
  }

  // ─────────────────────────────────────────────────
  // SELECT
  // ─────────────────────────────────────────────────
  private parseSelectStatement(tokens: SqlToken[], startIdx: number): ParseResult {
    const node: AstNode = { type: 'select_statement', tokens: [], children: [] }
    let idx = startIdx

    // SELECT 키워드
    node.tokens.push(tokens[idx++])

    // DISTINCT / ALL 수식어
    if (idx < tokens.length) {
      const upper = tokens[idx].value.toUpperCase()
      if (upper === 'DISTINCT' || upper === 'ALL' || upper === 'TOP') {
        const mod: AstNode = { type: 'select_modifier', tokens: [tokens[idx++]] }
        // TOP n
        if (mod.tokens[0].value.toUpperCase() === 'TOP' && idx < tokens.length) {
          mod.tokens.push(tokens[idx++])
        }
        node.children!.push(mod)
      }
    }

    // SELECT 컬럼 절
    const colResult = this.parseSelectColumns(tokens, idx)
    if (colResult) {
      node.children!.push(colResult.node)
      idx = colResult.nextIndex
    }

    // FROM
    if (idx < tokens.length && tokens[idx].value.toUpperCase() === 'FROM') {
      const fromResult = this.parseFromClause(tokens, idx)
      if (fromResult) {
        node.children!.push(fromResult.node)
        idx = fromResult.nextIndex
      }
    }

    // JOIN (여러 개)
    while (idx < tokens.length && this.isJoinKeyword(tokens[idx])) {
      const joinResult = this.parseJoinClause(tokens, idx)
      if (joinResult) {
        node.children!.push(joinResult.node)
        idx = joinResult.nextIndex
      } else break
    }

    // WHERE
    if (idx < tokens.length && tokens[idx].value.toUpperCase() === 'WHERE') {
      const whereResult = this.parseWhereClause(tokens, idx)
      if (whereResult) {
        node.children!.push(whereResult.node)
        idx = whereResult.nextIndex
      }
    }

    // GROUP BY
    if (idx < tokens.length && tokens[idx].value.toUpperCase() === 'GROUP') {
      const groupResult = this.parseGroupByClause(tokens, idx)
      if (groupResult) {
        node.children!.push(groupResult.node)
        idx = groupResult.nextIndex
      }
    }

    // HAVING
    if (idx < tokens.length && tokens[idx].value.toUpperCase() === 'HAVING') {
      const havingResult = this.parseHavingClause(tokens, idx)
      if (havingResult) {
        node.children!.push(havingResult.node)
        idx = havingResult.nextIndex
      }
    }

    // ORDER BY
    if (idx < tokens.length && tokens[idx].value.toUpperCase() === 'ORDER') {
      const orderResult = this.parseOrderByClause(tokens, idx)
      if (orderResult) {
        node.children!.push(orderResult.node)
        idx = orderResult.nextIndex
      }
    }

    // LIMIT / OFFSET / FETCH NEXT
    if (idx < tokens.length && tokens[idx].value.toUpperCase() === 'LIMIT') {
      const limitResult = this.parseLimitClause(tokens, idx)
      if (limitResult) {
        node.children!.push(limitResult.node)
        idx = limitResult.nextIndex
      }
    }

    // UNION / INTERSECT / EXCEPT
    while (idx < tokens.length) {
      const upper = tokens[idx].value.toUpperCase()
      if (upper === 'UNION' || upper === 'INTERSECT' || upper === 'EXCEPT') {
        const setResult = this.parseSetOperation(tokens, idx)
        if (setResult) {
          node.children!.push(setResult.node)
          idx = setResult.nextIndex
        } else break
      } else break
    }

    // 세미콜론
    if (idx < tokens.length && tokens[idx].type === 'semicolon') {
      node.tokens.push(tokens[idx++])
    }

    return { node, nextIndex: idx }
  }

  // SELECT 컬럼 목록 (콤마로 구분, 서브쿼리/함수 괄호 인식)
  private parseSelectColumns(tokens: SqlToken[], startIdx: number): ParseResult {
    const node: AstNode = { type: 'select_columns', tokens: [], children: [] }
    let idx = startIdx
    let col: SqlToken[] = []
    let depth = 0

    while (idx < tokens.length) {
      const t = tokens[idx]
      const upper = t.value.toUpperCase()

      if (t.type === 'parenthesis' && t.value === '(') depth++
      if (t.type === 'parenthesis' && t.value === ')') depth--

      // depth=0 에서 절 종료 키워드 또는 세미콜론
      if (depth === 0) {
        if (t.type === 'semicolon') break
        if (t.type === 'keyword' && CLAUSE_TERMINATORS.has(upper)) break
      }

      if (depth === 0 && t.type === 'comma') {
        if (col.length > 0) {
          node.children!.push({ type: 'column', tokens: col })
          col = []
        }
        idx++
        continue
      }

      col.push(t)
      idx++
    }

    if (col.length > 0) {
      node.children!.push({ type: 'column', tokens: col })
    }

    return { node, nextIndex: idx }
  }

  // ─────────────────────────────────────────────────
  // FROM
  // ─────────────────────────────────────────────────
  private parseFromClause(tokens: SqlToken[], startIdx: number): ParseResult {
    const node: AstNode = { type: 'from_clause', tokens: [], children: [] }
    let idx = startIdx

    // FROM 키워드
    node.tokens.push(tokens[idx++])

    // 테이블 소스 (서브쿼리 / 일반 테이블 목록, 콤마 구분)
    while (idx < tokens.length) {
      const t = tokens[idx]
      const upper = t.value.toUpperCase()

      if (t.type === 'semicolon') break
      if (t.type === 'keyword' && (
        upper === 'WHERE' || upper === 'GROUP' || upper === 'HAVING' ||
        upper === 'ORDER' || upper === 'LIMIT' || upper === 'UNION' ||
        upper === 'INTERSECT' || upper === 'EXCEPT' || this.isJoinKeyword(t)
      )) break

      if (t.value === '(') {
        // 서브쿼리 또는 파생 테이블
        const subResult = this.parseParenthesizedSubquery(tokens, idx)
        if (subResult) {
          node.children!.push(subResult.node)
          idx = subResult.nextIndex
          // alias
          if (idx < tokens.length && tokens[idx].value.toUpperCase() === 'AS') {
            node.tokens.push(tokens[idx++])
          }
          if (idx < tokens.length && tokens[idx].type === 'identifier') {
            node.tokens.push(tokens[idx++])
          }
          continue
        }
      }

      node.tokens.push(t)
      idx++
    }

    return { node, nextIndex: idx }
  }

  // ─────────────────────────────────────────────────
  // JOIN
  // ─────────────────────────────────────────────────
  private isJoinKeyword(token: SqlToken): boolean {
    const upper = token.value.toUpperCase()
    return token.type === 'keyword' && (
      upper === 'JOIN' || upper === 'INNER' || upper === 'LEFT' ||
      upper === 'RIGHT' || upper === 'FULL' || upper === 'CROSS' ||
      upper === 'NATURAL'
    )
  }

  private parseJoinClause(tokens: SqlToken[], startIdx: number): ParseResult {
    const node: AstNode = { type: 'join_clause', tokens: [], children: [] }
    let idx = startIdx

    // JOIN 종류 키워드들 (LEFT OUTER JOIN 등 복합)
    while (idx < tokens.length && tokens[idx].type === 'keyword') {
      const upper = tokens[idx].value.toUpperCase()
      if (['LEFT', 'RIGHT', 'FULL', 'INNER', 'OUTER', 'CROSS',
           'NATURAL', 'JOIN'].includes(upper)) {
        node.tokens.push(tokens[idx++])
      } else break
    }

    // 테이블명 + alias
    while (idx < tokens.length) {
      const t = tokens[idx]
      const upper = t.value.toUpperCase()
      if (t.type === 'semicolon') break
      if (upper === 'ON' || upper === 'USING') break
      if (this.isJoinKeyword(t)) break
      if (t.type === 'keyword' && CLAUSE_TERMINATORS.has(upper) &&
          upper !== 'ON' && upper !== 'USING') break
      node.tokens.push(t)
      idx++
    }

    // ON 절
    if (idx < tokens.length && tokens[idx].value.toUpperCase() === 'ON') {
      const onNode: AstNode = { type: 'join_on', tokens: [tokens[idx++]] }
      while (idx < tokens.length) {
        const t = tokens[idx]
        const upper = t.value.toUpperCase()
        if (t.type === 'semicolon') break
        if (this.isJoinKeyword(t)) break
        if (t.type === 'keyword' && (
          upper === 'WHERE' || upper === 'GROUP' || upper === 'ORDER' ||
          upper === 'HAVING' || upper === 'LIMIT' || upper === 'UNION' ||
          upper === 'INTERSECT' || upper === 'EXCEPT'
        )) break
        onNode.tokens.push(t)
        idx++
      }
      node.children!.push(onNode)
    }

    // USING 절
    if (idx < tokens.length && tokens[idx].value.toUpperCase() === 'USING') {
      const usingNode: AstNode = { type: 'join_using', tokens: [tokens[idx++]] }
      if (idx < tokens.length && tokens[idx].value === '(') {
        const end = this.findMatchingParen(tokens, idx)
        while (idx <= end && idx < tokens.length) {
          usingNode.tokens.push(tokens[idx++])
        }
      }
      node.children!.push(usingNode)
    }

    return { node, nextIndex: idx }
  }

  // ─────────────────────────────────────────────────
  // WHERE
  // ─────────────────────────────────────────────────
  private parseWhereClause(tokens: SqlToken[], startIdx: number): ParseResult {
    const node: AstNode = { type: 'where_clause', tokens: [], children: [] }
    let idx = startIdx
    node.tokens.push(tokens[idx++]) // WHERE

    const condResult = this.parseConditionExpression(tokens, idx, [
      'GROUP', 'HAVING', 'ORDER', 'LIMIT', 'UNION', 'INTERSECT', 'EXCEPT',
      'FETCH', 'FOR',
    ])
    if (condResult) {
      node.children!.push(condResult.node)
      idx = condResult.nextIndex
    }

    return { node, nextIndex: idx }
  }

  // ─────────────────────────────────────────────────
  // GROUP BY
  // ─────────────────────────────────────────────────
  private parseGroupByClause(tokens: SqlToken[], startIdx: number): ParseResult {
    const node: AstNode = { type: 'group_by_clause', tokens: [], children: [] }
    let idx = startIdx

    // GROUP
    node.tokens.push(tokens[idx++])
    // BY
    if (idx < tokens.length && tokens[idx].value.toUpperCase() === 'BY') {
      node.tokens.push(tokens[idx++])
    }

    // 컬럼 목록 (콤마 구분)
    let col: SqlToken[] = []
    let depth = 0
    while (idx < tokens.length) {
      const t = tokens[idx]
      const upper = t.value.toUpperCase()

      if (t.type === 'parenthesis' && t.value === '(') depth++
      if (t.type === 'parenthesis' && t.value === ')') depth--

      if (depth === 0) {
        if (t.type === 'semicolon') break
        if (t.type === 'keyword' && (
          upper === 'HAVING' || upper === 'ORDER' || upper === 'LIMIT' ||
          upper === 'UNION' || upper === 'INTERSECT' || upper === 'EXCEPT'
        )) break
      }

      if (depth === 0 && t.type === 'comma') {
        if (col.length > 0) {
          node.children!.push({ type: 'group_column', tokens: col })
          col = []
        }
        idx++
        continue
      }

      col.push(t)
      idx++
    }
    if (col.length > 0) {
      node.children!.push({ type: 'group_column', tokens: col })
    }

    return { node, nextIndex: idx }
  }

  // ─────────────────────────────────────────────────
  // HAVING
  // ─────────────────────────────────────────────────
  private parseHavingClause(tokens: SqlToken[], startIdx: number): ParseResult {
    const node: AstNode = { type: 'having_clause', tokens: [], children: [] }
    let idx = startIdx
    node.tokens.push(tokens[idx++]) // HAVING

    const condResult = this.parseConditionExpression(tokens, idx, [
      'ORDER', 'LIMIT', 'UNION', 'INTERSECT', 'EXCEPT', 'FETCH',
    ])
    if (condResult) {
      node.children!.push(condResult.node)
      idx = condResult.nextIndex
    }

    return { node, nextIndex: idx }
  }

  // ─────────────────────────────────────────────────
  // ORDER BY
  // ─────────────────────────────────────────────────
  private parseOrderByClause(tokens: SqlToken[], startIdx: number): ParseResult {
    const node: AstNode = { type: 'order_by_clause', tokens: [], children: [] }
    let idx = startIdx

    node.tokens.push(tokens[idx++]) // ORDER
    if (idx < tokens.length && tokens[idx].value.toUpperCase() === 'BY') {
      node.tokens.push(tokens[idx++])
    }

    let col: SqlToken[] = []
    let depth = 0
    while (idx < tokens.length) {
      const t = tokens[idx]
      const upper = t.value.toUpperCase()

      if (t.type === 'parenthesis' && t.value === '(') depth++
      if (t.type === 'parenthesis' && t.value === ')') depth--

      if (depth === 0) {
        if (t.type === 'semicolon') break
        if (t.type === 'keyword' && (
          upper === 'LIMIT' || upper === 'OFFSET' || upper === 'FETCH' ||
          upper === 'UNION' || upper === 'INTERSECT' || upper === 'EXCEPT' ||
          upper === 'FOR'
        )) break
      }

      if (depth === 0 && t.type === 'comma') {
        if (col.length > 0) {
          node.children!.push({ type: 'order_column', tokens: col })
          col = []
        }
        idx++
        continue
      }

      col.push(t)
      idx++
    }
    if (col.length > 0) {
      node.children!.push({ type: 'order_column', tokens: col })
    }

    return { node, nextIndex: idx }
  }

  // ─────────────────────────────────────────────────
  // LIMIT / OFFSET
  // ─────────────────────────────────────────────────
  private parseLimitClause(tokens: SqlToken[], startIdx: number): ParseResult {
    const node: AstNode = { type: 'limit_clause', tokens: [] }
    let idx = startIdx

    // LIMIT n
    node.tokens.push(tokens[idx++])
    if (idx < tokens.length && tokens[idx].type === 'number') {
      node.tokens.push(tokens[idx++])
    }

    // OFFSET n
    if (idx < tokens.length && tokens[idx].value.toUpperCase() === 'OFFSET') {
      node.tokens.push(tokens[idx++])
      if (idx < tokens.length && tokens[idx].type === 'number') {
        node.tokens.push(tokens[idx++])
      }
    }

    return { node, nextIndex: idx }
  }

  // ─────────────────────────────────────────────────
  // UNION / INTERSECT / EXCEPT
  // ─────────────────────────────────────────────────
  private parseSetOperation(tokens: SqlToken[], startIdx: number): ParseResult {
    const node: AstNode = { type: 'set_operation', tokens: [], children: [] }
    let idx = startIdx

    // UNION [ALL] / INTERSECT / EXCEPT
    node.tokens.push(tokens[idx++])
    if (idx < tokens.length && tokens[idx].value.toUpperCase() === 'ALL') {
      node.tokens.push(tokens[idx++])
    }

    // 다음 SELECT
    if (idx < tokens.length && tokens[idx].value.toUpperCase() === 'SELECT') {
      const selResult = this.parseSelectStatement(tokens, idx)
      if (selResult) {
        node.children!.push(selResult.node)
        idx = selResult.nextIndex
      }
    }

    return { node, nextIndex: idx }
  }

  // ─────────────────────────────────────────────────
  // INSERT
  // ─────────────────────────────────────────────────
  private parseInsertStatement(tokens: SqlToken[], startIdx: number): ParseResult {
    const node: AstNode = { type: 'insert_statement', tokens: [], children: [] }
    let idx = startIdx

    node.tokens.push(tokens[idx++]) // INSERT

    // INTO
    if (idx < tokens.length && tokens[idx].value.toUpperCase() === 'INTO') {
      node.tokens.push(tokens[idx++])
    }

    // 테이블명
    const tableNode: AstNode = { type: 'table_name', tokens: [] }
    while (idx < tokens.length) {
      const t = tokens[idx]
      const upper = t.value.toUpperCase()
      if (t.value === '(' || (t.type === 'keyword' &&
        (upper === 'VALUES' || upper === 'SELECT' || upper === 'DEFAULT'))) break
      tableNode.tokens.push(t)
      idx++
    }
    node.children!.push(tableNode)

    // 컬럼 목록 ( col1, col2, ... )
    if (idx < tokens.length && tokens[idx].value === '(') {
      const colListResult = this.parseColumnList(tokens, idx)
      if (colListResult) {
        node.children!.push(colListResult.node)
        idx = colListResult.nextIndex
      }
    }

    // VALUES ( ... ), ( ... ) 또는 SELECT
    if (idx < tokens.length) {
      const upper = tokens[idx].value.toUpperCase()

      if (upper === 'VALUES') {
        const valuesNode: AstNode = { type: 'values_clause', tokens: [tokens[idx++]], children: [] }
        while (idx < tokens.length && tokens[idx].value === '(') {
          const rowResult = this.parseParenthesizedList(tokens, idx)
          if (rowResult) {
            valuesNode.children!.push(rowResult.node)
            idx = rowResult.nextIndex
          }
          if (idx < tokens.length && tokens[idx].type === 'comma') idx++
          else break
        }
        node.children!.push(valuesNode)
      } else if (upper === 'SELECT') {
        const selResult = this.parseSelectStatement(tokens, idx)
        if (selResult) {
          node.children!.push(selResult.node)
          idx = selResult.nextIndex
        }
      }
    }

    // RETURNING
    if (idx < tokens.length && tokens[idx].value.toUpperCase() === 'RETURNING') {
      const retResult = this.parseReturningClause(tokens, idx)
      if (retResult) {
        node.children!.push(retResult.node)
        idx = retResult.nextIndex
      }
    }

    if (idx < tokens.length && tokens[idx].type === 'semicolon') {
      node.tokens.push(tokens[idx++])
    }

    return { node, nextIndex: idx }
  }

  // ─────────────────────────────────────────────────
  // UPDATE
  // ─────────────────────────────────────────────────
  private parseUpdateStatement(tokens: SqlToken[], startIdx: number): ParseResult {
    const node: AstNode = { type: 'update_statement', tokens: [], children: [] }
    let idx = startIdx

    node.tokens.push(tokens[idx++]) // UPDATE

    // 테이블명
    const tableNode: AstNode = { type: 'table_name', tokens: [] }
    while (idx < tokens.length) {
      const t = tokens[idx]
      if (t.type === 'keyword' && t.value.toUpperCase() === 'SET') break
      tableNode.tokens.push(t)
      idx++
    }
    node.children!.push(tableNode)

    // SET 절
    if (idx < tokens.length && tokens[idx].value.toUpperCase() === 'SET') {
      const setNode: AstNode = { type: 'set_clause', tokens: [tokens[idx++]], children: [] }
      let assignment: SqlToken[] = []
      let depth = 0
      while (idx < tokens.length) {
        const t = tokens[idx]
        const upper = t.value.toUpperCase()

        if (t.type === 'parenthesis' && t.value === '(') depth++
        if (t.type === 'parenthesis' && t.value === ')') depth--

        if (depth === 0) {
          if (t.type === 'semicolon') break
          if (t.type === 'keyword' && (upper === 'WHERE' || upper === 'RETURNING' || upper === 'FROM')) break
        }

        if (depth === 0 && t.type === 'comma') {
          if (assignment.length > 0) {
            setNode.children!.push({ type: 'assignment', tokens: assignment })
            assignment = []
          }
          idx++
          continue
        }

        assignment.push(t)
        idx++
      }
      if (assignment.length > 0) {
        setNode.children!.push({ type: 'assignment', tokens: assignment })
      }
      node.children!.push(setNode)
    }

    // FROM (PostgreSQL UPDATE ... FROM)
    if (idx < tokens.length && tokens[idx].value.toUpperCase() === 'FROM') {
      const fromResult = this.parseFromClause(tokens, idx)
      if (fromResult) {
        node.children!.push(fromResult.node)
        idx = fromResult.nextIndex
      }
    }

    // WHERE
    if (idx < tokens.length && tokens[idx].value.toUpperCase() === 'WHERE') {
      const whereResult = this.parseWhereClause(tokens, idx)
      if (whereResult) {
        node.children!.push(whereResult.node)
        idx = whereResult.nextIndex
      }
    }

    // RETURNING
    if (idx < tokens.length && tokens[idx].value.toUpperCase() === 'RETURNING') {
      const retResult = this.parseReturningClause(tokens, idx)
      if (retResult) {
        node.children!.push(retResult.node)
        idx = retResult.nextIndex
      }
    }

    if (idx < tokens.length && tokens[idx].type === 'semicolon') {
      node.tokens.push(tokens[idx++])
    }

    return { node, nextIndex: idx }
  }

  // ─────────────────────────────────────────────────
  // DELETE
  // ─────────────────────────────────────────────────
  private parseDeleteStatement(tokens: SqlToken[], startIdx: number): ParseResult {
    const node: AstNode = { type: 'delete_statement', tokens: [], children: [] }
    let idx = startIdx

    node.tokens.push(tokens[idx++]) // DELETE

    // FROM
    if (idx < tokens.length && tokens[idx].value.toUpperCase() === 'FROM') {
      node.tokens.push(tokens[idx++])
    }

    // 테이블명
    const tableNode: AstNode = { type: 'table_name', tokens: [] }
    while (idx < tokens.length) {
      const t = tokens[idx]
      const upper = t.value.toUpperCase()
      if (t.type === 'semicolon') break
      if (t.type === 'keyword' && (upper === 'WHERE' || upper === 'USING' || upper === 'RETURNING')) break
      tableNode.tokens.push(t)
      idx++
    }
    node.children!.push(tableNode)

    // USING (PostgreSQL)
    if (idx < tokens.length && tokens[idx].value.toUpperCase() === 'USING') {
      const usingNode: AstNode = { type: 'using_clause', tokens: [tokens[idx++]] }
      while (idx < tokens.length) {
        const t = tokens[idx]
        if (t.type === 'semicolon' || t.value.toUpperCase() === 'WHERE') break
        usingNode.tokens.push(t)
        idx++
      }
      node.children!.push(usingNode)
    }

    // WHERE
    if (idx < tokens.length && tokens[idx].value.toUpperCase() === 'WHERE') {
      const whereResult = this.parseWhereClause(tokens, idx)
      if (whereResult) {
        node.children!.push(whereResult.node)
        idx = whereResult.nextIndex
      }
    }

    // RETURNING
    if (idx < tokens.length && tokens[idx].value.toUpperCase() === 'RETURNING') {
      const retResult = this.parseReturningClause(tokens, idx)
      if (retResult) {
        node.children!.push(retResult.node)
        idx = retResult.nextIndex
      }
    }

    if (idx < tokens.length && tokens[idx].type === 'semicolon') {
      node.tokens.push(tokens[idx++])
    }

    return { node, nextIndex: idx }
  }

  // ─────────────────────────────────────────────────
  // CREATE
  // ─────────────────────────────────────────────────
  private parseCreateStatement(tokens: SqlToken[], startIdx: number): ParseResult {
    const node: AstNode = { type: 'create_statement', tokens: [], children: [] }
    let idx = startIdx

    // CREATE [OR REPLACE] [TEMPORARY] TABLE/VIEW/...
    node.tokens.push(tokens[idx++])
    while (idx < tokens.length) {
      const upper = tokens[idx].value.toUpperCase()
      if (['OR', 'REPLACE', 'TEMPORARY', 'TEMP', 'UNIQUE'].includes(upper)) {
        node.tokens.push(tokens[idx++])
      } else break
    }

    if (idx >= tokens.length) return { node, nextIndex: idx }

    const objectType = tokens[idx].value.toUpperCase()
    node.tokens.push(tokens[idx++])

    if (objectType === 'TABLE') {
      // IF NOT EXISTS
      if (idx < tokens.length && tokens[idx].value.toUpperCase() === 'IF') {
        while (idx < tokens.length) {
          node.tokens.push(tokens[idx])
          if (tokens[idx].value.toUpperCase() === 'EXISTS') { idx++; break }
          idx++
        }
      }
      // 테이블명
      const tableNode: AstNode = { type: 'table_name', tokens: [] }
      while (idx < tokens.length && tokens[idx].value !== '(' && tokens[idx].type !== 'semicolon') {
        tableNode.tokens.push(tokens[idx++])
      }
      node.children!.push(tableNode)

      // 컬럼/제약 정의 목록
      if (idx < tokens.length && tokens[idx].value === '(') {
        const colDefs = this.parseTableColumnDefs(tokens, idx)
        if (colDefs) {
          node.children!.push(colDefs.node)
          idx = colDefs.nextIndex
        }
      }
    } else if (objectType === 'VIEW') {
      // 뷰명
      const viewNode: AstNode = { type: 'view_name', tokens: [] }
      while (idx < tokens.length) {
        const upper = tokens[idx].value.toUpperCase()
        if (upper === 'AS' || tokens[idx].type === 'semicolon') break
        viewNode.tokens.push(tokens[idx++])
      }
      node.children!.push(viewNode)
      // AS
      if (idx < tokens.length && tokens[idx].value.toUpperCase() === 'AS') {
        node.tokens.push(tokens[idx++])
      }
      // SELECT body
      if (idx < tokens.length && tokens[idx].value.toUpperCase() === 'SELECT') {
        const selResult = this.parseSelectStatement(tokens, idx)
        if (selResult) {
          node.children!.push(selResult.node)
          idx = selResult.nextIndex
        }
      }
    } else {
      // INDEX, PROCEDURE, FUNCTION 등 - generic
      while (idx < tokens.length && tokens[idx].type !== 'semicolon') {
        node.tokens.push(tokens[idx++])
      }
    }

    if (idx < tokens.length && tokens[idx].type === 'semicolon') {
      node.tokens.push(tokens[idx++])
    }

    return { node, nextIndex: idx }
  }

  // ─────────────────────────────────────────────────
  // ALTER / DROP (generic)
  // ─────────────────────────────────────────────────
  private parseAlterStatement(tokens: SqlToken[], startIdx: number): ParseResult {
    return this.parseGenericStatement(tokens, startIdx)
  }

  private parseDropStatement(tokens: SqlToken[], startIdx: number): ParseResult {
    return this.parseGenericStatement(tokens, startIdx)
  }

  // ─────────────────────────────────────────────────
  // PL/SQL DECLARE
  // ─────────────────────────────────────────────────
  private parseDeclareStatement(tokens: SqlToken[], startIdx: number): ParseResult {
    const node: AstNode = { type: 'declare_statement', tokens: [], children: [] }
    let idx = startIdx
    node.tokens.push(tokens[idx++]) // DECLARE

    // 변수 선언들: 세미콜론 단위
    while (idx < tokens.length) {
      const upper = tokens[idx].value.toUpperCase()
      if (upper === 'BEGIN') break

      const declVar: AstNode = { type: 'declare_var', tokens: [] }
      while (idx < tokens.length) {
        const t = tokens[idx]
        declVar.tokens.push(t)
        if (t.type === 'semicolon') { idx++; break }
        idx++
      }
      if (declVar.tokens.length > 0) node.children!.push(declVar)
    }

    // BEGIN ... END 블록
    if (idx < tokens.length && tokens[idx].value.toUpperCase() === 'BEGIN') {
      const blockResult = this.parseBlockStatement(tokens, idx)
      if (blockResult) {
        node.children!.push(blockResult.node)
        idx = blockResult.nextIndex
      }
    }

    return { node, nextIndex: idx }
  }

  // ─────────────────────────────────────────────────
  // BEGIN ... END (PL/SQL 블록)
  // ─────────────────────────────────────────────────
  private parseBlockStatement(tokens: SqlToken[], startIdx: number): ParseResult {
    const node: AstNode = { type: 'block_statement', tokens: [], children: [] }
    let idx = startIdx
    node.tokens.push(tokens[idx++]) // BEGIN

    let depth = 1
    while (idx < tokens.length && depth > 0) {
      const upper = tokens[idx].value.toUpperCase()

      if (upper === 'BEGIN') depth++
      if (upper === 'END') {
        depth--
        if (depth === 0) {
          node.tokens.push(tokens[idx++])
          // END; 또는 END name;
          if (idx < tokens.length && tokens[idx].type === 'identifier') {
            node.tokens.push(tokens[idx++])
          }
          if (idx < tokens.length && tokens[idx].type === 'semicolon') {
            node.tokens.push(tokens[idx++])
          }
          break
        }
      }

      // EXCEPTION 블록
      if (upper === 'EXCEPTION' && depth === 1) {
        const exResult = this.parseExceptionBlock(tokens, idx)
        if (exResult) {
          node.children!.push(exResult.node)
          idx = exResult.nextIndex
          continue
        }
      }

      // 내부 문장 파싱
      const stmtResult = this.parseStatement(tokens, idx)
      if (stmtResult) {
        node.children!.push(stmtResult.node)
        idx = stmtResult.nextIndex
      } else {
        idx++
      }
    }

    return { node, nextIndex: idx }
  }

  private parseExceptionBlock(tokens: SqlToken[], startIdx: number): ParseResult {
    const node: AstNode = { type: 'exception_block', tokens: [tokens[startIdx]], children: [] }
    let idx = startIdx + 1

    while (idx < tokens.length) {
      const upper = tokens[idx].value.toUpperCase()
      if (upper === 'END') break
      // WHEN ... THEN ...
      if (upper === 'WHEN') {
        const whenNode: AstNode = { type: 'exception_when', tokens: [] }
        while (idx < tokens.length) {
          const t = tokens[idx]
          whenNode.tokens.push(t)
          if (t.type === 'semicolon') { idx++; break }
          idx++
        }
        node.children!.push(whenNode)
      } else {
        idx++
      }
    }

    return { node, nextIndex: idx }
  }

  // ─────────────────────────────────────────────────
  // MERGE
  // ─────────────────────────────────────────────────
  private parseMergeStatement(tokens: SqlToken[], startIdx: number): ParseResult {
    return this.parseGenericStatement(tokens, startIdx)
  }

  // ─────────────────────────────────────────────────
  // RETURNING
  // ─────────────────────────────────────────────────
  private parseReturningClause(tokens: SqlToken[], startIdx: number): ParseResult {
    const node: AstNode = { type: 'returning_clause', tokens: [tokens[startIdx]] }
    let idx = startIdx + 1
    while (idx < tokens.length) {
      const t = tokens[idx]
      if (t.type === 'semicolon') break
      node.tokens.push(t)
      idx++
    }
    return { node, nextIndex: idx }
  }

  // ─────────────────────────────────────────────────
  // 서브쿼리 (괄호 안 SELECT)
  // ─────────────────────────────────────────────────
  private parseParenthesizedSubquery(tokens: SqlToken[], startIdx: number): ParseResult {
    const node: AstNode = { type: 'subquery', tokens: [], children: [] }
    let idx = startIdx

    node.tokens.push(tokens[idx++]) // (

    // 내부 SELECT 파싱
    if (idx < tokens.length && tokens[idx].value.toUpperCase() === 'SELECT') {
      const selResult = this.parseSelectStatement(tokens, idx)
      if (selResult) {
        node.children!.push(selResult.node)
        idx = selResult.nextIndex
      }
    } else {
      // SELECT가 아니면 generic 수집
      let depth = 1
      while (idx < tokens.length && depth > 0) {
        const t = tokens[idx]
        if (t.value === '(') depth++
        if (t.value === ')') { depth--; if (depth === 0) break }
        node.tokens.push(t)
        idx++
      }
    }

    if (idx < tokens.length && tokens[idx].value === ')') {
      node.tokens.push(tokens[idx++]) // )
    }

    return { node, nextIndex: idx }
  }

  // ─────────────────────────────────────────────────
  // 유틸 파서들
  // ─────────────────────────────────────────────────
  private parseConditionExpression(
    tokens: SqlToken[],
    startIdx: number,
    terminators: string[]
  ): ParseResult {
    const node: AstNode = { type: 'condition', tokens: [], children: [] }
    const termSet = new Set(terminators)
    let idx = startIdx
    let depth = 0
    let andOrGroups: SqlToken[][] = []
    let currentGroup: SqlToken[] = []

    while (idx < tokens.length) {
      const t = tokens[idx]
      const upper = t.value.toUpperCase()

      if (t.type === 'parenthesis' && t.value === '(') depth++
      if (t.type === 'parenthesis' && t.value === ')') depth--

      if (depth === 0) {
        if (t.type === 'semicolon') break
        if (t.type === 'keyword' && termSet.has(upper)) break

        // AND / OR 를 그룹 경계로
        if ((upper === 'AND' || upper === 'OR') && currentGroup.length > 0) {
          andOrGroups.push(currentGroup)
          currentGroup = [t]
          idx++
          continue
        }
      }

      currentGroup.push(t)
      idx++
    }

    if (currentGroup.length > 0) andOrGroups.push(currentGroup)

    for (const grp of andOrGroups) {
      node.children!.push({ type: 'condition_group', tokens: grp })
    }

    return { node, nextIndex: idx }
  }

  private parseColumnList(tokens: SqlToken[], startIdx: number): ParseResult {
    const node: AstNode = { type: 'column_list', tokens: [], children: [] }
    let idx = startIdx
    node.tokens.push(tokens[idx++]) // (

    let col: SqlToken[] = []
    while (idx < tokens.length && tokens[idx].value !== ')') {
      const t = tokens[idx]
      if (t.type === 'comma') {
        if (col.length > 0) {
          node.children!.push({ type: 'column', tokens: col })
          col = []
        }
      } else {
        col.push(t)
      }
      idx++
    }
    if (col.length > 0) node.children!.push({ type: 'column', tokens: col })
    if (idx < tokens.length) node.tokens.push(tokens[idx++]) // )

    return { node, nextIndex: idx }
  }

  private parseParenthesizedList(tokens: SqlToken[], startIdx: number): ParseResult {
    const node: AstNode = { type: 'value_list', tokens: [], children: [] }
    let idx = startIdx
    node.tokens.push(tokens[idx++]) // (

    let depth = 1
    let val: SqlToken[] = []
    while (idx < tokens.length && depth > 0) {
      const t = tokens[idx]
      if (t.value === '(') depth++
      if (t.value === ')') {
        depth--
        if (depth === 0) {
          if (val.length > 0) node.children!.push({ type: 'value', tokens: val })
          node.tokens.push(tokens[idx++])
          break
        }
      }
      if (depth === 1 && t.type === 'comma') {
        if (val.length > 0) node.children!.push({ type: 'value', tokens: val })
        val = []
        idx++
        continue
      }
      val.push(t)
      idx++
    }

    return { node, nextIndex: idx }
  }

  private parseTableColumnDefs(tokens: SqlToken[], startIdx: number): ParseResult {
    const node: AstNode = { type: 'column_defs', tokens: [], children: [] }
    let idx = startIdx
    node.tokens.push(tokens[idx++]) // (

    let depth = 1
    let colDef: SqlToken[] = []
    while (idx < tokens.length && depth > 0) {
      const t = tokens[idx]
      if (t.value === '(') depth++
      if (t.value === ')') {
        depth--
        if (depth === 0) {
          if (colDef.length > 0) node.children!.push({ type: 'column_def', tokens: colDef })
          node.tokens.push(tokens[idx++])
          break
        }
      }
      if (depth === 1 && t.type === 'comma') {
        if (colDef.length > 0) node.children!.push({ type: 'column_def', tokens: colDef })
        colDef = []
        idx++
        continue
      }
      colDef.push(t)
      idx++
    }

    return { node, nextIndex: idx }
  }

  private parseGenericStatement(tokens: SqlToken[], startIdx: number): ParseResult {
    const node: AstNode = { type: 'generic_statement', tokens: [] }
    let idx = startIdx
    while (idx < tokens.length) {
      node.tokens.push(tokens[idx])
      if (tokens[idx].type === 'semicolon') { idx++; break }
      idx++
    }
    return { node, nextIndex: idx }
  }

  private findMatchingParen(tokens: SqlToken[], openIdx: number): number {
    let depth = 0
    for (let i = openIdx; i < tokens.length; i++) {
      if (tokens[i].value === '(') depth++
      if (tokens[i].value === ')') { depth--; if (depth === 0) return i }
    }
    return tokens.length - 1
  }
}
