import type { FormatterConfig, FormatOptions } from '../types/config'
import type { AstNode } from './parser'
import { SqlTokenizer } from './tokenizer'
import { SqlParser } from './parser'
import { applyAutoIndent } from './autoIndentFormatter'
import { extractSubqueries, restoreSubqueries, presplitByKeywords, indentBlock } from './utils/subqueryUtils'
import { MyBatisTemplateHandler, hasMybatisMarkers } from './utils/mybatisUtils'
import { renderTokens, applyTokenCase, applyKeywordCase, buildIndent, formatColumnStr } from './utils/renderUtils'
import { detectDialect } from './utils/dialectUtils'


// ─────────────────────────────────────────────────
// SqlFormatter
// ─────────────────────────────────────────────────
export class SqlFormatter {
  private tokenizer: SqlTokenizer
  private parser: SqlParser
  private config: FormatterConfig
  private mybatisHandler: MyBatisTemplateHandler

  constructor(config: Partial<FormatterConfig> = {}) {
    this.config = {
      defaultDialect: 'sql',
      maxLineLength: 80,
      indentType: 'spaces',
      keywordCase: 'upper',
      tabWidth: 2,
      commaPosition: 'trailing',
      denseOperators: false,
      lineBreakStyle: 'unix',
      ...config,
    }
    this.tokenizer = new SqlTokenizer()
    this.parser = new SqlParser()
    this.mybatisHandler = new MyBatisTemplateHandler()
  }

  format(sql: string, options: FormatOptions = {}): string {
    const cfg = { ...this.config, ...options }

    // MyBatis 템플릿 처리
    let workSql = sql
    let placeholders = new Map<string, string>()
    if (options.templateType === 'mybatis' || hasMybatisMarkers(sql)) {
      const extracted = this.mybatisHandler.extract(sql)
      workSql = extracted.sql
      placeholders = extracted.placeholders
    }

    try {
      const tokens = this.tokenizer.tokenize(workSql)
      const ast = this.parser.parse(tokens)
      let result = this.formatAst(ast, cfg)

      // Auto 들여쓰기 모드 처리
      if (options.autoIndent) {
        result = applyAutoIndent(result, cfg)
      } else {
        // 비-auto 모드: AST 파서가 subquery 노드를 인식하지 못한 인라인 서브쿼리를
        // 유틸리티로 추출·재포매팅하여 올바른 들여쓰기를 적용한다.
        result = this.applySubqueryFormatting(result, cfg)
      }

      // 줄바꿈 정규화
      if (cfg.lineBreakStyle === 'windows') {
        result = result.replace(/\n/g, '\r\n')
      }

      // MyBatis 복원
      if (placeholders.size > 0) {
        result = this.mybatisHandler.restore(result, placeholders)
      }

      return result
    } catch (err) {
      console.warn('SQL 포매팅 실패, 원본 반환:', err)
      return sql
    }
  }

  // ─────────────────────────────────────────────────
  // AST 포매팅 진입
  // ─────────────────────────────────────────────────
  private formatAst(ast: AstNode[], cfg: FormatterConfig): string {
    const parts: string[] = []

    for (const node of ast) {
      const text = this.formatNode(node, cfg, 0).trimEnd()
      if (text.length === 0) continue

      // comment, placeholder 노드는 빈 줄 없이 앞 내용에 바로 이어붙임
      const isInline =
        node.type === 'comment_node' ||
        node.type === 'mybatis_placeholder_node'

      if (parts.length === 0 || isInline) {
        parts.push(text)
      } else {
        // 직전 노드가 inline이면 빈 줄 없이, 아니면 빈 줄 하나
        const prevNode = ast[ast.indexOf(node) - 1]
        const prevIsInline =
          prevNode?.type === 'comment_node' ||
          prevNode?.type === 'mybatis_placeholder_node'
        parts.push(prevIsInline ? text : '\n' + text)
      }
    }

    return parts.join('\n')
  }

  private formatNode(node: AstNode, cfg: FormatterConfig, indentLevel: number): string {
    switch (node.type) {
      case 'select_statement':          return this.formatSelectStatement(node, cfg, indentLevel)
      case 'insert_statement':          return this.formatInsertStatement(node, cfg, indentLevel)
      case 'update_statement':          return this.formatUpdateStatement(node, cfg, indentLevel)
      case 'delete_statement':          return this.formatDeleteStatement(node, cfg, indentLevel)
      case 'create_statement':          return this.formatCreateStatement(node, cfg, indentLevel)
      case 'cte_statement':             return this.formatCteStatement(node, cfg, indentLevel)
      case 'declare_statement':         return this.formatDeclareStatement(node, cfg, indentLevel)
      case 'block_statement':           return this.formatBlockStatement(node, cfg, indentLevel)
      case 'set_operation':             return this.formatSetOperation(node, cfg, indentLevel)
      case 'generic_statement':         return this.formatGenericStatement(node, cfg)
      // comment / MyBatis 플레이스홀더는 토큰 값 그대로 출력
      case 'comment_node':              return node.tokens.map(t => t.value).join('')
      case 'mybatis_placeholder_node':  return node.tokens.map(t => t.value).join('')
      default:                          return renderTokens(node.tokens, cfg)
    }
  }

  // ─────────────────────────────────────────────────
  // CTE
  // ─────────────────────────────────────────────────
  private formatCteStatement(node: AstNode, cfg: FormatterConfig, indent: number): string {
    const ind = buildIndent(cfg, indent)
    const lines: string[] = [`${ind}${applyKeywordCase('WITH', cfg)}`]

    const cteDefs = node.children?.filter(c => c.type === 'cte_definition') ?? []
    cteDefs.forEach((def, i) => {
      const nameParts = def.tokens.map(t => applyTokenCase(t, cfg)).join(' ')
      const subqueryChild = def.children?.find(c => c.type === 'subquery')
      const subBody = subqueryChild
        ? this.formatSubquery(subqueryChild, cfg, indent + 1)
        : '()'
      const comma = i < cteDefs.length - 1 ? ',' : ''
      lines.push(`${ind}${buildIndent(cfg, 1)}${nameParts} (`)
      lines.push(subBody)
      lines.push(`${ind}${buildIndent(cfg, 1)})${comma}`)
    })

    const mainNode = node.children?.find(c =>
      ['select_statement', 'insert_statement', 'update_statement', 'delete_statement'].includes(c.type)
    )
    if (mainNode) {
      lines.push(this.formatNode(mainNode, cfg, indent))
    }

    return lines.join('\n')
  }

  // ─────────────────────────────────────────────────
  // SELECT
  // ─────────────────────────────────────────────────
  private formatSelectStatement(node: AstNode, cfg: FormatterConfig, indent: number): string {
    const ind = buildIndent(cfg, indent)
    const lines: string[] = []

    // SELECT [modifier]
    const modifier = node.children?.find(c => c.type === 'select_modifier')
    const modStr = modifier ? ' ' + renderTokens(modifier.tokens, cfg) : ''
    lines.push(`${ind}${applyKeywordCase('SELECT', cfg)}${modStr}`)

    // 컬럼 절
    const colsNode = node.children?.find(c => c.type === 'select_columns')
    if (colsNode) {
      const cols = colsNode.children?.filter(c => c.type === 'column') ?? []
      cols.forEach((col, i) => {
        const colStr = renderTokens(col.tokens, cfg)
        lines.push(formatColumnStr(colStr, cfg, indent + 1, i, cols.length))
      })
    }

    // FROM
    const fromNode = node.children?.find(c => c.type === 'from_clause')
    if (fromNode) lines.push(this.formatFromClause(fromNode, cfg, indent))

    // JOIN
    const joinNodes = node.children?.filter(c => c.type === 'join_clause') ?? []
    for (const jn of joinNodes) lines.push(this.formatJoinClause(jn, cfg, indent))

    // WHERE
    const whereNode = node.children?.find(c => c.type === 'where_clause')
    if (whereNode) lines.push(this.formatWhereClause(whereNode, cfg, indent))

    // GROUP BY
    const groupNode = node.children?.find(c => c.type === 'group_by_clause')
    if (groupNode) lines.push(this.formatGroupByClause(groupNode, cfg, indent))

    // HAVING
    const havingNode = node.children?.find(c => c.type === 'having_clause')
    if (havingNode) lines.push(this.formatHavingClause(havingNode, cfg, indent))

    // ORDER BY
    const orderNode = node.children?.find(c => c.type === 'order_by_clause')
    if (orderNode) lines.push(this.formatOrderByClause(orderNode, cfg, indent))

    // LIMIT
    const limitNode = node.children?.find(c => c.type === 'limit_clause')
    if (limitNode) lines.push(`${ind}${renderTokens(limitNode.tokens, cfg)}`)

    // UNION / INTERSECT / EXCEPT
    const setOps = node.children?.filter(c => c.type === 'set_operation') ?? []
    for (const so of setOps) lines.push(this.formatSetOperation(so, cfg, indent))

    // 세미콜론
    const hasSemi = node.tokens.some(t => t.type === 'semicolon')
    if (hasSemi && lines.length > 0) {
      lines[lines.length - 1] = lines[lines.length - 1].trimEnd() + ';'
    }

    return lines.join('\n')
  }

  // ─────────────────────────────────────────────────
  // INSERT
  // ─────────────────────────────────────────────────
  private formatInsertStatement(node: AstNode, cfg: FormatterConfig, indent: number): string {
    const ind = buildIndent(cfg, indent)
    const ind1 = buildIndent(cfg, indent + 1)
    const lines: string[] = []

    const tableName = node.children?.find(c => c.type === 'table_name')
    const tableStr = tableName ? renderTokens(tableName.tokens, cfg) : ''

    lines.push(`${ind}${applyKeywordCase('INSERT INTO', cfg)} ${tableStr}`)

    // 컬럼 목록
    const colList = node.children?.find(c => c.type === 'column_list')
    if (colList) {
      const cols = colList.children?.map(c => renderTokens(c.tokens, cfg)) ?? []
      lines.push(`${ind}(`)
      cols.forEach((col, i) => {
        const comma = i < cols.length - 1 ? ',' : ''
        lines.push(`${ind1}${col}${comma}`)
      })
      lines.push(`${ind})`)
    }

    // VALUES
    const valuesNode = node.children?.find(c => c.type === 'values_clause')
    if (valuesNode) {
      lines.push(`${ind}${applyKeywordCase('VALUES', cfg)}`)
      const rows = valuesNode.children?.filter(c => c.type === 'value_list') ?? []
      rows.forEach((row, ri) => {
        const vals = row.children?.map(v => renderTokens(v.tokens, cfg)) ?? []
        const comma = ri < rows.length - 1 ? ',' : ''
        lines.push(`${ind}(`)
        vals.forEach((v, vi) => {
          const vc = vi < vals.length - 1 ? ',' : ''
          lines.push(`${ind1}${v}${vc}`)
        })
        lines.push(`${ind})${comma}`)
      })
    }

    // INSERT ... SELECT
    const selNode = node.children?.find(c => c.type === 'select_statement')
    if (selNode) lines.push(this.formatSelectStatement(selNode, cfg, indent))

    // RETURNING
    const retNode = node.children?.find(c => c.type === 'returning_clause')
    if (retNode) lines.push(`${ind}${renderTokens(retNode.tokens, cfg)}`)

    const hasSemi = node.tokens.some(t => t.type === 'semicolon')
    if (hasSemi && lines.length > 0) lines[lines.length - 1] += ';'

    return lines.join('\n')
  }

  // ─────────────────────────────────────────────────
  // UPDATE
  // ─────────────────────────────────────────────────
  private formatUpdateStatement(node: AstNode, cfg: FormatterConfig, indent: number): string {
    const ind = buildIndent(cfg, indent)
    const ind1 = buildIndent(cfg, indent + 1)
    const lines: string[] = []

    const tableName = node.children?.find(c => c.type === 'table_name')
    const tableStr = tableName ? renderTokens(tableName.tokens, cfg) : ''
    lines.push(`${ind}${applyKeywordCase('UPDATE', cfg)} ${tableStr}`)

    // SET
    const setNode = node.children?.find(c => c.type === 'set_clause')
    if (setNode) {
      lines.push(`${ind}${applyKeywordCase('SET', cfg)}`)
      const assignments = setNode.children?.filter(c => c.type === 'assignment') ?? []
      assignments.forEach((a, i) => {
        const comma = i < assignments.length - 1 ? ',' : ''
        lines.push(`${ind1}${renderTokens(a.tokens, cfg)}${comma}`)
      })
    }

    // FROM (PostgreSQL)
    const fromNode = node.children?.find(c => c.type === 'from_clause')
    if (fromNode) lines.push(this.formatFromClause(fromNode, cfg, indent))

    // WHERE
    const whereNode = node.children?.find(c => c.type === 'where_clause')
    if (whereNode) lines.push(this.formatWhereClause(whereNode, cfg, indent))

    // RETURNING
    const retNode = node.children?.find(c => c.type === 'returning_clause')
    if (retNode) lines.push(`${ind}${renderTokens(retNode.tokens, cfg)}`)

    const hasSemi = node.tokens.some(t => t.type === 'semicolon')
    if (hasSemi && lines.length > 0) lines[lines.length - 1] += ';'

    return lines.join('\n')
  }

  // ─────────────────────────────────────────────────
  // DELETE
  // ─────────────────────────────────────────────────
  private formatDeleteStatement(node: AstNode, cfg: FormatterConfig, indent: number): string {
    const ind = buildIndent(cfg, indent)
    const lines: string[] = []

    const tableName = node.children?.find(c => c.type === 'table_name')
    const tableStr = tableName ? renderTokens(tableName.tokens, cfg) : ''
    lines.push(`${ind}${applyKeywordCase('DELETE FROM', cfg)} ${tableStr}`)

    const usingNode = node.children?.find(c => c.type === 'using_clause')
    if (usingNode) {
      lines.push(`${ind}${applyKeywordCase('USING', cfg)} ${renderTokens(usingNode.tokens.slice(1), cfg)}`)
    }

    const whereNode = node.children?.find(c => c.type === 'where_clause')
    if (whereNode) lines.push(this.formatWhereClause(whereNode, cfg, indent))

    const retNode = node.children?.find(c => c.type === 'returning_clause')
    if (retNode) lines.push(`${ind}${renderTokens(retNode.tokens, cfg)}`)

    const hasSemi = node.tokens.some(t => t.type === 'semicolon')
    if (hasSemi && lines.length > 0) lines[lines.length - 1] += ';'

    return lines.join('\n')
  }

  // ─────────────────────────────────────────────────
  // CREATE TABLE / VIEW
  // ─────────────────────────────────────────────────
  private formatCreateStatement(node: AstNode, cfg: FormatterConfig, indent: number): string {
    const ind = buildIndent(cfg, indent)
    const ind1 = buildIndent(cfg, indent + 1)
    const lines: string[] = []

    // CREATE [OR REPLACE] [TEMP] TABLE/VIEW name
    const headerTokens = node.tokens.filter(t => t.type !== 'semicolon')
    const headerStr = renderTokens(headerTokens, cfg)

    const tableName = node.children?.find(c => c.type === 'table_name')
    const viewName = node.children?.find(c => c.type === 'view_name')
    const nameStr = tableName
      ? renderTokens(tableName.tokens, cfg)
      : viewName
      ? renderTokens(viewName.tokens, cfg)
      : ''

    lines.push(`${ind}${headerStr}${nameStr ? ' ' + nameStr : ''}`)

    // 컬럼 정의
    const colDefs = node.children?.find(c => c.type === 'column_defs')
    if (colDefs) {
      lines.push(`${ind}(`)
      const defs = colDefs.children ?? []
      defs.forEach((d, i) => {
        const comma = i < defs.length - 1 ? ',' : ''
        lines.push(`${ind1}${renderTokens(d.tokens, cfg)}${comma}`)
      })
      lines.push(`${ind})`)
    }

    // AS SELECT (VIEW)
    const viewSelect = node.children?.find(c => c.type === 'select_statement')
    if (viewSelect) {
      lines.push(`${ind}${applyKeywordCase('AS', cfg)}`)
      lines.push(this.formatSelectStatement(viewSelect, cfg, indent + 1))
    }

    const hasSemi = node.tokens.some(t => t.type === 'semicolon')
    if (hasSemi && lines.length > 0) lines[lines.length - 1] += ';'

    return lines.join('\n')
  }

  // ─────────────────────────────────────────────────
  // PL/SQL DECLARE
  // ─────────────────────────────────────────────────
  private formatDeclareStatement(node: AstNode, cfg: FormatterConfig, indent: number): string {
    const ind = buildIndent(cfg, indent)
    const ind1 = buildIndent(cfg, indent + 1)
    const lines: string[] = [`${ind}${applyKeywordCase('DECLARE', cfg)}`]

    const vars = node.children?.filter(c => c.type === 'declare_var') ?? []
    for (const v of vars) {
      lines.push(`${ind1}${renderTokens(v.tokens, cfg)}`)
    }

    const block = node.children?.find(c => c.type === 'block_statement')
    if (block) lines.push(this.formatBlockStatement(block, cfg, indent))

    return lines.join('\n')
  }

  // ─────────────────────────────────────────────────
  // BEGIN ... END 블록
  // ─────────────────────────────────────────────────
  private formatBlockStatement(node: AstNode, cfg: FormatterConfig, indent: number): string {
    const ind = buildIndent(cfg, indent)
    const ind1 = buildIndent(cfg, indent + 1)
    const lines: string[] = [`${ind}${applyKeywordCase('BEGIN', cfg)}`]

    const children = node.children ?? []
    for (const child of children) {
      if (child.type === 'exception_block') {
        lines.push(`${ind}${applyKeywordCase('EXCEPTION', cfg)}`)
        for (const when of child.children ?? []) {
          lines.push(`${ind1}${renderTokens(when.tokens, cfg)}`)
        }
      } else {
        const formatted = this.formatNode(child, cfg, indent + 1)
        lines.push(formatted)
      }
    }

    lines.push(`${ind}${applyKeywordCase('END', cfg)};`)

    return lines.join('\n')
  }

  // ─────────────────────────────────────────────────
  // UNION / INTERSECT / EXCEPT
  // ─────────────────────────────────────────────────
  private formatSetOperation(node: AstNode, cfg: FormatterConfig, indent: number): string {
    const ind = buildIndent(cfg, indent)
    const lines: string[] = []
    const opStr = renderTokens(node.tokens, cfg)
    lines.push(`${ind}${opStr}`)

    const selNode = node.children?.find(c => c.type === 'select_statement')
    if (selNode) lines.push(this.formatSelectStatement(selNode, cfg, indent))

    return lines.join('\n')
  }

  // ─────────────────────────────────────────────────
  // 절(Clause) 포매터들
  // ─────────────────────────────────────────────────
  private formatFromClause(node: AstNode, cfg: FormatterConfig, indent: number): string {
    const ind = buildIndent(cfg, indent)
    const ind1 = buildIndent(cfg, indent + 1)
    const lines: string[] = [`${ind}${applyKeywordCase('FROM', cfg)}`]

    // 서브쿼리(파생 테이블)
    const subqueries = node.children?.filter(c => c.type === 'subquery') ?? []
    if (subqueries.length > 0) {
      for (const sq of subqueries) {
        lines.push(`${ind1}(`)
        lines.push(this.formatSubquery(sq, cfg, indent + 2))
        lines.push(`${ind1})`)
      }
    }

    // 일반 테이블 토큰
    const mainTokens = node.tokens.filter(t => t.value.toUpperCase() !== 'FROM')
    if (mainTokens.length > 0) {
      lines.push(`${ind1}${renderTokens(mainTokens, cfg)}`)
    }

    return lines.join('\n')
  }

  private formatJoinClause(node: AstNode, cfg: FormatterConfig, indent: number): string {
    const ind = buildIndent(cfg, indent)
    const ind1 = buildIndent(cfg, indent + 1)
    const lines: string[] = []

    const joinKw = renderTokens(node.tokens, cfg)
    lines.push(`${ind}${joinKw}`)

    const onNode = node.children?.find(c => c.type === 'join_on')
    if (onNode) {
      const onTokens = onNode.tokens
      const onKw = applyKeywordCase('ON', cfg)
      const rest = renderTokens(onTokens.slice(1), cfg)
      lines.push(`${ind1}${onKw} ${rest}`)
    }

    const usingNode = node.children?.find(c => c.type === 'join_using')
    if (usingNode) {
      lines.push(`${ind1}${renderTokens(usingNode.tokens, cfg)}`)
    }

    return lines.join('\n')
  }

  private formatWhereClause(node: AstNode, cfg: FormatterConfig, indent: number): string {
    const ind = buildIndent(cfg, indent)
    const ind1 = buildIndent(cfg, indent + 1)
    const lines: string[] = [`${ind}${applyKeywordCase('WHERE', cfg)}`]

    const condNode = node.children?.find(c => c.type === 'condition')
    if (condNode) {
      const groups = condNode.children ?? []
      groups.forEach((grp) => {
        const tokens = grp.tokens
        const firstToken = tokens[0]
        const isConnector = firstToken && (
          firstToken.value.toUpperCase() === 'AND' ||
          firstToken.value.toUpperCase() === 'OR'
        )

        if (isConnector) {
          const connector = applyTokenCase(firstToken, cfg)
          const rest = renderTokens(tokens.slice(1), cfg)
          lines.push(`${ind1}${connector} ${rest}`)
        } else {
          lines.push(`${ind1}${renderTokens(tokens, cfg)}`)
        }
      })
    }

    return lines.join('\n')
  }

  private formatGroupByClause(node: AstNode, cfg: FormatterConfig, indent: number): string {
    const ind = buildIndent(cfg, indent)
    const lines: string[] = [`${ind}${applyKeywordCase('GROUP BY', cfg)}`]

    const cols = node.children?.filter(c => c.type === 'group_column') ?? []
    cols.forEach((col, i) => {
      lines.push(formatColumnStr(renderTokens(col.tokens, cfg), cfg, indent + 1, i, cols.length))
    })

    return lines.join('\n')
  }

  private formatHavingClause(node: AstNode, cfg: FormatterConfig, indent: number): string {
    const ind = buildIndent(cfg, indent)
    const ind1 = buildIndent(cfg, indent + 1)
    const lines: string[] = [`${ind}${applyKeywordCase('HAVING', cfg)}`]

    const condNode = node.children?.find(c => c.type === 'condition')
    if (condNode) {
      const groups = condNode.children ?? []
      groups.forEach(grp => {
        const tokens = grp.tokens
        const firstToken = tokens[0]
        const isConnector = firstToken && (
          firstToken.value.toUpperCase() === 'AND' ||
          firstToken.value.toUpperCase() === 'OR'
        )
        if (isConnector) {
          lines.push(`${ind1}${applyTokenCase(firstToken, cfg)} ${renderTokens(tokens.slice(1), cfg)}`)
        } else {
          lines.push(`${ind1}${renderTokens(tokens, cfg)}`)
        }
      })
    }

    return lines.join('\n')
  }

  private formatOrderByClause(node: AstNode, cfg: FormatterConfig, indent: number): string {
    const ind = buildIndent(cfg, indent)
    const lines: string[] = [`${ind}${applyKeywordCase('ORDER BY', cfg)}`]

    const cols = node.children?.filter(c => c.type === 'order_column') ?? []
    cols.forEach((col, i) => {
      lines.push(formatColumnStr(renderTokens(col.tokens, cfg), cfg, indent + 1, i, cols.length))
    })

    return lines.join('\n')
  }

  private formatGenericStatement(node: AstNode, cfg: FormatterConfig): string {
    return renderTokens(node.tokens, cfg)
  }

  // ─────────────────────────────────────────────────
  // 비-auto 모드 서브쿼리 후처리
  //
  // formatAst 결과에서 인라인으로 남은 서브쿼리를
  // extractSubqueries / restoreSubqueries 로 분리·들여쓰기한다.
  //
  // ※ 최상위 SQL 전체에 presplitByKeywords 를 적용하지 않는다.
  //   formatAst 가 이미 절 단위 줄바꿈을 완료했으므로
  //   재적용하면 WHERE 조건의 AND 앞에 빈 줄이 추가된다. (문제 4)
  //   presplitByKeywords 는 추출된 서브쿼리 내부에만 적용한다.
  // ─────────────────────────────────────────────────
  private applySubqueryFormatting(sql: string, cfg: FormatterConfig): string {
    // 서브쿼리 추출 (presplit 없이 원본 그대로)
    const extracted = extractSubqueries(sql)
    if (extracted.subBlocks.length === 0) return sql

    const restored = restoreSubqueries(
      extracted.sql,
      extracted.subBlocks,
      cfg,
      // formatInner: 추출된 서브쿼리 내부에만 presplit + 재귀 적용
      (inner, baseIndent) => {
        const presplit = presplitByKeywords(inner, cfg)
        const innerExtracted = extractSubqueries(presplit)
        if (innerExtracted.subBlocks.length > 0) {
          const innerRestored = restoreSubqueries(
            innerExtracted.sql,
            innerExtracted.subBlocks,
            cfg,
            (deepInner, deepBaseIndent) =>
              this.formatInnerSubquery(deepInner, deepBaseIndent, cfg)
          )
          return indentBlock(innerRestored, baseIndent)
        }
        return indentBlock(presplit, baseIndent)
      }
    )

    return restored
  }

  /**
   * 재귀 서브쿼리 포매팅 헬퍼
   * baseIndent 를 전달받아 내부 줄에 올바른 들여쓰기를 적용한다.
   */
  private formatInnerSubquery(sql: string, baseIndent: string, cfg: FormatterConfig): string {
    const presplit = presplitByKeywords(sql, cfg)
    const extracted = extractSubqueries(presplit)
    if (extracted.subBlocks.length > 0) {
      const restored = restoreSubqueries(
        extracted.sql,
        extracted.subBlocks,
        cfg,
        (inner, innerBase) => this.formatInnerSubquery(inner, innerBase, cfg)
      )
      return indentBlock(restored, baseIndent)
    }
    return indentBlock(presplit, baseIndent)
  }

  // ─────────────────────────────────────────────────
  // 서브쿼리 포매팅 (재귀) — AST subquery 노드 전용
  // ─────────────────────────────────────────────────
  private formatSubquery(node: AstNode, cfg: FormatterConfig, indent: number): string {
    const selNode = node.children?.find(c => c.type === 'select_statement')
    if (selNode) {
      const indentStr = buildIndent(cfg, indent)
      let flattened = this.formatSelectStatement(selNode, cfg, 0)
      flattened = presplitByKeywords(flattened, cfg)

      const extracted = extractSubqueries(flattened)
      if (extracted.subBlocks.length > 0) {
        const processed = restoreSubqueries(
          extracted.sql,
          extracted.subBlocks,
          cfg,
          (inner, baseIndent) => this.formatInnerSubquery(inner, baseIndent, cfg)
        )
        return indentBlock(processed, indentStr)
      }

      return indentBlock(flattened, indentStr)
    }

    // generic fallback
    const inner = node.tokens
      .filter(t => t.value !== '(' && t.value !== ')')
      .map(t => applyTokenCase(t, cfg))
      .join(' ')
    return buildIndent(cfg, indent) + inner
  }

  // ─────────────────────────────────────────────────
  // 공개 유틸리티
  // ─────────────────────────────────────────────────

  /** SQL 방언 감지 — dialectUtils.detectDialect 위임 */
  detectDialect(sql: string) {
    return detectDialect(sql)
  }

  validate(sql: string): { isValid: boolean; errors: string[] } {
    try {
      this.tokenizer.tokenize(sql)
      return { isValid: true, errors: [] }
    } catch (err) {
      return { isValid: false, errors: [err instanceof Error ? err.message : 'Unknown error'] }
    }
  }
}