import type { SqlToken } from '../types/token'
import type { FormatterConfig, FormatOptions } from '../types/config'
import type { AstNode } from './parser'
import { SqlTokenizer } from './tokenizer'
import { SqlParser } from './parser'
import { applyAutoIndent } from './autoIndentFormatter'
import { extractSubqueries, restoreSubqueries, presplitByKeywords } from './subqueryUtils'

// ─────────────────────────────────────────────────
// MyBatis 템플릿 처리기
// ─────────────────────────────────────────────────
interface ExtractedTemplate {
  sql: string
  placeholders: Map<string, string>
}

/**
 * MyBatis 태그 분류
 * - structural : <where>, <set> → SQL 구조 절을 대체하는 태그
 *                파서가 WHERE / SET 키워드를 찾을 수 있도록
 *                키워드 sentinel(__MYBATIS_WHERE__, __MYBATIS_SET__)을 함께 삽입
 * - block      : <if>, <foreach>, <choose> 등 → 조건/반복 블록
 * - inline     : #{param}, ${param} → 값 파라미터
 */
const STRUCTURAL_TAG_RE =
  /^<\/?(?:where|set)\b/i

const BLOCK_TAG_RE =
  /^<\/?(?:if|foreach|choose|when|otherwise|trim|bind|include|sql|mapper|resultMap|select|insert|update|delete)\b/i

class MyBatisTemplateHandler {
  private counter = 0

  /** MyBatis 태그/파라미터를 플레이스홀더로 치환 후 순수 SQL 반환 */
  extract(input: string): ExtractedTemplate {
    const placeholders = new Map<string, string>()
    this.counter = 0

    let sql = input

    // 0) CDATA → open/close 각각 플레이스홀더로 보존, 내부 SQL은 그대로 노출
    //    별도 cdataCounter를 사용해 TAG/PARAM 번호와 충돌하지 않도록 함
    let cdataCounter = 0
    sql = sql.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_m, inner) => {
      const openKey  = `__MYBATIS_CDATA_OPEN_${cdataCounter}__`
      const closeKey = `__MYBATIS_CDATA_CLOSE_${cdataCounter}__`
      cdataCounter++
      placeholders.set(openKey,  '<![CDATA[')
      placeholders.set(closeKey, ']]>')
      // inner SQL은 그대로 꺼내고 앞뒤에 open/close 키 삽입
      return `${openKey}\n${inner}\n${closeKey}`
    })

    // 1) #{param}, ${param} → 인라인 파라미터 플레이스홀더
    sql = sql.replace(/[#$]\{[^}]*\}/g, (match) => {
      const key = `__MYBATIS_PARAM_${this.counter++}__`
      placeholders.set(key, match)
      return key
    })

    // 2) XML 태그 치환
    //    structural 태그(<where>, <set>)는 닫는 태그도 고려하여 처리
    sql = sql.replace(
      /<\/?(?:if|where|set|foreach|choose|when|otherwise|trim|bind|include|sql|mapper|resultMap|select|insert|update|delete)(?:\s[^>]*)?\/?>/gi,
      (match) => {
        const key = `__MYBATIS_TAG_${this.counter++}__`
        placeholders.set(key, match)

        // structural 열림 태그: 파서가 절을 인식하도록 sentinel 키워드 삽입
        // 앞뒤 공백을 반드시 포함하여 인접 토큰과의 merge를 방지
        if (STRUCTURAL_TAG_RE.test(match) && !match.startsWith('</')) {
          const tagNameMatch = match.match(/^<(\w+)/i)
          const tagName = tagNameMatch ? tagNameMatch[1].toUpperCase() : ''
          if (tagName === 'WHERE') return ` ${key} WHERE `
          if (tagName === 'SET')   return ` ${key} SET `
        }

        // 모든 태그 앞뒤에 공백 삽입 → 인접 토큰과 합쳐지는 merge 버그 방지
        return ` ${key} `
      }
    )

    return { sql, placeholders }
  }

  /** 포매팅된 SQL에 플레이스홀더를 원본으로 복원 */
  restore(sql: string, placeholders: Map<string, string>): string {
    let result = sql

    for (const [key, original] of placeholders) {
      // CDATA open/close 플레이스홀더: 줄바꿈 처리 후 복원
      if (key.includes('_CDATA_OPEN_')) {
        result = result.split(key).join(original)
        continue
      }
      if (key.includes('_CDATA_CLOSE_')) {
        // ]]> 앞에 줄바꿈이 없으면 추가
        result = result.split(key).join('\n' + original)
        continue
      }

      // structural 태그의 sentinel 키워드 + 공백도 함께 제거하며 복원
      const isStructuralOpen =
        STRUCTURAL_TAG_RE.test(original) && !original.startsWith('</')

      if (isStructuralOpen) {
        const tagName = original.match(/^<(\w+)/i)?.[1]?.toUpperCase() ?? ''
        // " PLACEHOLDER WHERE " / " PLACEHOLDER SET " 패턴 → 원본 태그로 복원
        result = result.split(` ${key} ${tagName} `).join('\n' + original + '\n')
        result = result.split(` ${key} ${tagName.toLowerCase()} `).join('\n' + original + '\n')
        result = result.split(`${key} ${tagName} `).join(original + '\n')
        result = result.split(`${key} ${tagName.toLowerCase()} `).join(original + '\n')
        result = result.split(` ${key} `).join(original)
        result = result.split(key).join(original)
      } else {
        result = result.split(` ${key} `).join(original)
        result = result.split(key).join(original)
      }
    }

    return result
  }
}

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
    if (options.templateType === 'mybatis' || this.hasMybatisMarkers(sql)) {
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

  private hasMybatisMarkers(sql: string): boolean {
    return /[#$]\{[^}]*\}|<(?:if|where|set|foreach|choose|when|otherwise|trim|bind)\b|<!\[CDATA\[/i.test(sql)
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
      default:                          return this.renderTokens(node.tokens, cfg)
    }
  }

  // ─────────────────────────────────────────────────
  // CTE
  // ─────────────────────────────────────────────────
  private formatCteStatement(node: AstNode, cfg: FormatterConfig, indent: number): string {
    const ind = this.indent(cfg, indent)
    const lines: string[] = [`${ind}${this.kw('WITH', cfg)}`]

    const cteDefs = node.children?.filter(c => c.type === 'cte_definition') ?? []
    cteDefs.forEach((def, i) => {
      const nameParts = def.tokens.map(t => this.applyCase(t, cfg)).join(' ')
      const subqueryChild = def.children?.find(c => c.type === 'subquery')
      const subBody = subqueryChild
        ? this.formatSubquery(subqueryChild, cfg, indent + 1)
        : '()'
      const comma = i < cteDefs.length - 1 ? ',' : ''
      lines.push(`${ind}${this.indent(cfg, 1)}${nameParts} (`)
      lines.push(subBody)
      lines.push(`${ind}${this.indent(cfg, 1)})${comma}`)
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
    const ind = this.indent(cfg, indent)
    const lines: string[] = []

    // SELECT [modifier]
    const modifier = node.children?.find(c => c.type === 'select_modifier')
    const modStr = modifier ? ' ' + this.renderTokens(modifier.tokens, cfg) : ''
    lines.push(`${ind}${this.kw('SELECT', cfg)}${modStr}`)

    // 컬럼 절
    const colsNode = node.children?.find(c => c.type === 'select_columns')
    if (colsNode) {
      const cols = colsNode.children?.filter(c => c.type === 'column') ?? []
      cols.forEach((col, i) => {
        const isLast = i === cols.length - 1
        const colStr = this.renderTokens(col.tokens, cfg)
        lines.push(this.formatColumn(colStr, cfg, indent + 1, i, cols.length))
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
    if (limitNode) lines.push(`${ind}${this.renderTokens(limitNode.tokens, cfg)}`)

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
    const ind = this.indent(cfg, indent)
    const ind1 = this.indent(cfg, indent + 1)
    const lines: string[] = []

    const tableName = node.children?.find(c => c.type === 'table_name')
    const tableStr = tableName ? this.renderTokens(tableName.tokens, cfg) : ''

    lines.push(`${ind}${this.kw('INSERT INTO', cfg)} ${tableStr}`)

    // 컬럼 목록
    const colList = node.children?.find(c => c.type === 'column_list')
    if (colList) {
      const cols = colList.children?.map(c => this.renderTokens(c.tokens, cfg)) ?? []
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
      lines.push(`${ind}${this.kw('VALUES', cfg)}`)
      const rows = valuesNode.children?.filter(c => c.type === 'value_list') ?? []
      rows.forEach((row, ri) => {
        const vals = row.children?.map(v => this.renderTokens(v.tokens, cfg)) ?? []
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
    if (retNode) lines.push(`${ind}${this.renderTokens(retNode.tokens, cfg)}`)

    const hasSemi = node.tokens.some(t => t.type === 'semicolon')
    if (hasSemi && lines.length > 0) lines[lines.length - 1] += ';'

    return lines.join('\n')
  }

  // ─────────────────────────────────────────────────
  // UPDATE
  // ─────────────────────────────────────────────────
  private formatUpdateStatement(node: AstNode, cfg: FormatterConfig, indent: number): string {
    const ind = this.indent(cfg, indent)
    const ind1 = this.indent(cfg, indent + 1)
    const lines: string[] = []

    const tableName = node.children?.find(c => c.type === 'table_name')
    const tableStr = tableName ? this.renderTokens(tableName.tokens, cfg) : ''
    lines.push(`${ind}${this.kw('UPDATE', cfg)} ${tableStr}`)

    // SET
    const setNode = node.children?.find(c => c.type === 'set_clause')
    if (setNode) {
      lines.push(`${ind}${this.kw('SET', cfg)}`)
      const assignments = setNode.children?.filter(c => c.type === 'assignment') ?? []
      assignments.forEach((a, i) => {
        const comma = i < assignments.length - 1 ? ',' : ''
        lines.push(`${ind1}${this.renderTokens(a.tokens, cfg)}${comma}`)
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
    if (retNode) lines.push(`${ind}${this.renderTokens(retNode.tokens, cfg)}`)

    const hasSemi = node.tokens.some(t => t.type === 'semicolon')
    if (hasSemi && lines.length > 0) lines[lines.length - 1] += ';'

    return lines.join('\n')
  }

  // ─────────────────────────────────────────────────
  // DELETE
  // ─────────────────────────────────────────────────
  private formatDeleteStatement(node: AstNode, cfg: FormatterConfig, indent: number): string {
    const ind = this.indent(cfg, indent)
    const lines: string[] = []

    const tableName = node.children?.find(c => c.type === 'table_name')
    const tableStr = tableName ? this.renderTokens(tableName.tokens, cfg) : ''
    lines.push(`${ind}${this.kw('DELETE FROM', cfg)} ${tableStr}`)

    const usingNode = node.children?.find(c => c.type === 'using_clause')
    if (usingNode) {
      lines.push(`${ind}${this.kw('USING', cfg)} ${this.renderTokens(usingNode.tokens.slice(1), cfg)}`)
    }

    const whereNode = node.children?.find(c => c.type === 'where_clause')
    if (whereNode) lines.push(this.formatWhereClause(whereNode, cfg, indent))

    const retNode = node.children?.find(c => c.type === 'returning_clause')
    if (retNode) lines.push(`${ind}${this.renderTokens(retNode.tokens, cfg)}`)

    const hasSemi = node.tokens.some(t => t.type === 'semicolon')
    if (hasSemi && lines.length > 0) lines[lines.length - 1] += ';'

    return lines.join('\n')
  }

  // ─────────────────────────────────────────────────
  // CREATE TABLE / VIEW
  // ─────────────────────────────────────────────────
  private formatCreateStatement(node: AstNode, cfg: FormatterConfig, indent: number): string {
    const ind = this.indent(cfg, indent)
    const ind1 = this.indent(cfg, indent + 1)
    const lines: string[] = []

    // CREATE [OR REPLACE] [TEMP] TABLE/VIEW name
    const headerTokens = node.tokens.filter(t => t.type !== 'semicolon')
    const headerStr = this.renderTokens(headerTokens, cfg)

    const tableName = node.children?.find(c => c.type === 'table_name')
    const viewName = node.children?.find(c => c.type === 'view_name')
    const nameStr = tableName
      ? this.renderTokens(tableName.tokens, cfg)
      : viewName
      ? this.renderTokens(viewName.tokens, cfg)
      : ''

    lines.push(`${ind}${headerStr}${nameStr ? ' ' + nameStr : ''}`)

    // 컬럼 정의
    const colDefs = node.children?.find(c => c.type === 'column_defs')
    if (colDefs) {
      lines.push(`${ind}(`)
      const defs = colDefs.children ?? []
      defs.forEach((d, i) => {
        const comma = i < defs.length - 1 ? ',' : ''
        lines.push(`${ind1}${this.renderTokens(d.tokens, cfg)}${comma}`)
      })
      lines.push(`${ind})`)
    }

    // AS SELECT (VIEW)
    const viewSelect = node.children?.find(c => c.type === 'select_statement')
    if (viewSelect) {
      lines.push(`${ind}${this.kw('AS', cfg)}`)
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
    const ind = this.indent(cfg, indent)
    const ind1 = this.indent(cfg, indent + 1)
    const lines: string[] = [`${ind}${this.kw('DECLARE', cfg)}`]

    const vars = node.children?.filter(c => c.type === 'declare_var') ?? []
    for (const v of vars) {
      lines.push(`${ind1}${this.renderTokens(v.tokens, cfg)}`)
    }

    const block = node.children?.find(c => c.type === 'block_statement')
    if (block) lines.push(this.formatBlockStatement(block, cfg, indent))

    return lines.join('\n')
  }

  // ─────────────────────────────────────────────────
  // BEGIN ... END 블록
  // ─────────────────────────────────────────────────
  private formatBlockStatement(node: AstNode, cfg: FormatterConfig, indent: number): string {
    const ind = this.indent(cfg, indent)
    const ind1 = this.indent(cfg, indent + 1)
    const lines: string[] = [`${ind}${this.kw('BEGIN', cfg)}`]

    const children = node.children ?? []
    for (const child of children) {
      if (child.type === 'exception_block') {
        lines.push(`${ind}${this.kw('EXCEPTION', cfg)}`)
        for (const when of child.children ?? []) {
          lines.push(`${ind1}${this.renderTokens(when.tokens, cfg)}`)
        }
      } else {
        const formatted = this.formatNode(child, cfg, indent + 1)
        lines.push(formatted)
      }
    }

    lines.push(`${ind}${this.kw('END', cfg)};`)

    return lines.join('\n')
  }

  // ─────────────────────────────────────────────────
  // UNION / INTERSECT / EXCEPT
  // ─────────────────────────────────────────────────
  private formatSetOperation(node: AstNode, cfg: FormatterConfig, indent: number): string {
    const ind = this.indent(cfg, indent)
    const lines: string[] = []
    const opStr = this.renderTokens(node.tokens, cfg)
    lines.push(`${ind}${opStr}`)

    const selNode = node.children?.find(c => c.type === 'select_statement')
    if (selNode) lines.push(this.formatSelectStatement(selNode, cfg, indent))

    return lines.join('\n')
  }

  // ─────────────────────────────────────────────────
  // 절(Clause) 포매터들
  // ─────────────────────────────────────────────────
  private formatFromClause(node: AstNode, cfg: FormatterConfig, indent: number): string {
    const ind = this.indent(cfg, indent)
    const ind1 = this.indent(cfg, indent + 1)
    const lines: string[] = [`${ind}${this.kw('FROM', cfg)}`]

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
      lines.push(`${ind1}${this.renderTokens(mainTokens, cfg)}`)
    }

    return lines.join('\n')
  }

  private formatJoinClause(node: AstNode, cfg: FormatterConfig, indent: number): string {
    const ind = this.indent(cfg, indent)
    const ind1 = this.indent(cfg, indent + 1)
    const lines: string[] = []

    const joinKw = this.renderTokens(node.tokens, cfg)
    lines.push(`${ind}${joinKw}`)

    const onNode = node.children?.find(c => c.type === 'join_on')
    if (onNode) {
      const onTokens = onNode.tokens
      const onKw = this.kw('ON', cfg)
      const rest = this.renderTokens(onTokens.slice(1), cfg)
      lines.push(`${ind1}${onKw} ${rest}`)
    }

    const usingNode = node.children?.find(c => c.type === 'join_using')
    if (usingNode) {
      lines.push(`${ind1}${this.renderTokens(usingNode.tokens, cfg)}`)
    }

    return lines.join('\n')
  }

  private formatWhereClause(node: AstNode, cfg: FormatterConfig, indent: number): string {
    const ind = this.indent(cfg, indent)
    const ind1 = this.indent(cfg, indent + 1)
    const lines: string[] = [`${ind}${this.kw('WHERE', cfg)}`]

    const condNode = node.children?.find(c => c.type === 'condition')
    if (condNode) {
      const groups = condNode.children ?? []
      groups.forEach((grp, i) => {
        const tokens = grp.tokens
        const firstToken = tokens[0]
        const isConnector = firstToken && (
          firstToken.value.toUpperCase() === 'AND' ||
          firstToken.value.toUpperCase() === 'OR'
        )

        if (isConnector) {
          const connector = this.applyCase(firstToken, cfg)
          const rest = this.renderTokens(tokens.slice(1), cfg)
          lines.push(`${ind1}${connector} ${rest}`)
        } else {
          lines.push(`${ind1}${this.renderTokens(tokens, cfg)}`)
        }
      })
    }

    return lines.join('\n')
  }

  private formatGroupByClause(node: AstNode, cfg: FormatterConfig, indent: number): string {
    const ind = this.indent(cfg, indent)
    const ind1 = this.indent(cfg, indent + 1)
    const lines: string[] = [`${ind}${this.kw('GROUP BY', cfg)}`]

    const cols = node.children?.filter(c => c.type === 'group_column') ?? []
    cols.forEach((col, i) => {
      lines.push(this.formatColumn(this.renderTokens(col.tokens, cfg), cfg, indent + 1, i, cols.length))
    })

    return lines.join('\n')
  }

  private formatHavingClause(node: AstNode, cfg: FormatterConfig, indent: number): string {
    const ind = this.indent(cfg, indent)
    const ind1 = this.indent(cfg, indent + 1)
    const lines: string[] = [`${ind}${this.kw('HAVING', cfg)}`]

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
          lines.push(`${ind1}${this.applyCase(firstToken, cfg)} ${this.renderTokens(tokens.slice(1), cfg)}`)
        } else {
          lines.push(`${ind1}${this.renderTokens(tokens, cfg)}`)
        }
      })
    }

    return lines.join('\n')
  }

  private formatOrderByClause(node: AstNode, cfg: FormatterConfig, indent: number): string {
    const ind = this.indent(cfg, indent)
    const lines: string[] = [`${ind}${this.kw('ORDER BY', cfg)}`]

    const cols = node.children?.filter(c => c.type === 'order_column') ?? []
    cols.forEach((col, i) => {
      lines.push(this.formatColumn(this.renderTokens(col.tokens, cfg), cfg, indent + 1, i, cols.length))
    })

    return lines.join('\n')
  }

  private formatGenericStatement(node: AstNode, cfg: FormatterConfig): string {
    return this.renderTokens(node.tokens, cfg)
  }

  // ─────────────────────────────────────────────────
  // 서브쿼리 포매팅 (재귀)
  // ─────────────────────────────────────────────────
  private formatSubquery(node: AstNode, cfg: FormatterConfig, indent: number): string {
    const selNode = node.children?.find(c => c.type === 'select_statement')
    if (selNode) {
      // 서브쿼리 내용을 먼저 기본 포매팅으로 평탄화
      let flattened = this.formatSelectStatement(selNode, cfg, 0)
      
      // 키워드 기준으로 미리 줄바꿈 적용
      flattened = presplitByKeywords(flattened, cfg)
      
      // 서브쿼리 처리 유틸리티 적용
      const extracted = extractSubqueries(flattened)
      if (extracted.subBlocks.length > 0) {
        // 중첩 서브쿼리가 있으면 재귀적으로 처리
        const processed = restoreSubqueries(
          extracted.sql, 
          extracted.subBlocks, 
          cfg,
          (inner) => {
            // 내부 서브쿼리도 동일한 방식으로 처리
            const innerExtracted = extractSubqueries(inner)
            if (innerExtracted.subBlocks.length > 0) {
              return restoreSubqueries(
                innerExtracted.sql, 
                innerExtracted.subBlocks, 
                cfg
              )
            }
            return inner
          }
        )
        // 들여쓰기 적용
        const lines = processed.split('\n')
        const indentedLines = lines.map(line => 
          line.trim() ? this.indent(cfg, indent) + line.trim() : ''
        )
        return indentedLines.join('\n').trim()
      }
      
      // 단순 서브쿼리는 기본 들여쓰기만 적용
      const lines = flattened.split('\n')
      const indentedLines = lines.map(line => 
        line.trim() ? this.indent(cfg, indent) + line.trim() : ''
      )
      return indentedLines.join('\n').trim()
    }
    
    // generic fallback
    const inner = node.tokens
      .filter(t => t.value !== '(' && t.value !== ')')
      .map(t => this.applyCase(t, cfg))
      .join(' ')
    return this.indent(cfg, indent) + inner
  }

  // ─────────────────────────────────────────────────
  // 컬럼 포매팅 (콤마 위치 처리)
  // ─────────────────────────────────────────────────
  private formatColumn(
    colStr: string,
    cfg: FormatterConfig,
    indentLevel: number,
    index: number,
    total: number
  ): string {
    const ind = this.indent(cfg, indentLevel)
    const isLast = index === total - 1

    if (cfg.commaPosition === 'leading') {
      const prefix = index === 0 ? '  ' : ', '
      return `${ind}${prefix}${colStr}`
    } else {
      // trailing
      const suffix = isLast ? '' : ','
      return `${ind}${colStr}${suffix}`
    }
  }

  // ─────────────────────────────────────────────────
  // 토큰 렌더링 유틸
  // ─────────────────────────────────────────────────
  private renderTokens(tokens: SqlToken[], cfg: FormatterConfig): string {
    const nonWs = tokens.filter(t => t.type !== 'whitespace')
    const parts: string[] = []

    for (let i = 0; i < nonWs.length; i++) {
      const t = nonWs[i]
      const prev = nonWs[i - 1]

      let value = this.applyCase(t, cfg)

      // 연산자 공백 처리
      if (t.type === 'operator') {
        if (cfg.denseOperators) {
          // dense 모드: 앞 공백 제거, 뒤 공백 없이 붙임
          if (parts.length > 0) {
            parts[parts.length - 1] = parts[parts.length - 1].replace(/ $/, '')
          }
          parts.push(value)
          continue
        }
        // 일반 모드: 연산자 앞 공백 확보 후 뒤에 공백 추가
        if (parts.length > 0) {
          const last = parts[parts.length - 1]
          if (!last.endsWith(' ')) parts[parts.length - 1] = last + ' '
        }
        parts.push(value + ' ')
        continue
      }

      // 점(.) 전후 공백 없음
      // prev 가 dot 이고, 그 prev 자체가 실질적인 identifier/keyword인 경우만 적용
      // comment 같은 '구분 불가' 토큰 뒤에는 적용하지 않음
      const prevIsDot = prev?.type === 'dot'
      const isDotToken = t.type === 'dot'

      if (isDotToken) {
        // dot 자체: 앞 공백 제거 후 붙임
        if (parts.length > 0) parts[parts.length - 1] = parts[parts.length - 1].replace(/ $/, '')
        parts.push(value)
        continue
      }

      if (prevIsDot) {
        // dot 바로 다음 토큰: identifier나 number만 공백 없이 붙임
        // keyword(AS, IN 등)나 다른 타입은 공백 유지
        if (t.type === 'identifier' || t.type === 'number') {
          if (parts.length > 0) parts[parts.length - 1] = parts[parts.length - 1].replace(/ $/, '')
          parts.push(value + ' ')
          continue
        }
      }

      // 닫는 괄호 앞 공백 제거
      if (t.value === ')' && parts.length > 0) {
        parts[parts.length - 1] = parts[parts.length - 1].replace(/ $/, '')
        parts.push(value)
        continue
      }

      // 여는 괄호: 뒤에 공백 없이 (다음 토큰이 바로 붙도록)
      if (t.value === '(') {
        parts.push(value)
        continue
      }

      // 콤마 앞 공백 제거, 뒤에 공백 추가
      if (t.type === 'comma') {
        if (parts.length > 0) parts[parts.length - 1] = parts[parts.length - 1].replace(/ $/, '')
        parts.push(value + ' ')
        continue
      }

      // comment 토큰: 뒤에 반드시 공백 추가 (다음 토큰과 붙지 않도록)
      if (t.type === 'comment') {
        parts.push(value + ' ')
        continue
      }

      parts.push(value + ' ')
    }

    return parts.join('').trimEnd()
  }

  private applyCase(token: SqlToken, cfg: FormatterConfig): string {
    if (token.type === 'keyword') {
      switch (cfg.keywordCase) {
        case 'upper': return token.value.toUpperCase()
        case 'lower': return token.value.toLowerCase()
        default: return token.originalCase ?? token.value
      }
    }
    return token.value
  }

  private kw(keyword: string, cfg: FormatterConfig): string {
    switch (cfg.keywordCase) {
      case 'upper': return keyword.toUpperCase()
      case 'lower': return keyword.toLowerCase()
      default: return keyword
    }
  }

  private indent(cfg: FormatterConfig, level: number): string {
    if (cfg.indentType === 'tabs') return '\t'.repeat(level)
    return ' '.repeat(level * cfg.tabWidth)
  }

  // ─────────────────────────────────────────────────
  // 공개 유틸리티
  // ─────────────────────────────────────────────────
  detectDialect(sql: string): 'sql' | 'plsql' | 'mysql' | 'postgresql' | 'transactsql' | 'mybatis' {
    const up = sql.toUpperCase()
    // MyBatis: #{...}, ${...} 파라미터 또는 MyBatis XML 태그 또는 CDATA 래퍼
    if (/[#$]\{[^}]*\}|<(?:if|where|set|foreach|choose|when|otherwise|trim|bind)\b|<!\[CDATA\[/i.test(sql)) return 'mybatis'
    if (/\b(DECLARE|BEGIN|END|PROCEDURE|FUNCTION|PACKAGE|TRIGGER|CURSOR|EXCEPTION)\b/.test(up)) return 'plsql'
    if (/\b(LIMIT|AUTO_INCREMENT|TINYINT|ENUM|SHOW|DESCRIBE)\b/.test(up)) return 'mysql'
    if (/\b(SERIAL|BIGSERIAL|BYTEA|JSONB|ARRAY|ILIKE|EXCLUDE)\b/.test(up)) return 'postgresql'
    if (/\b(TOP|IDENTITY|NVARCHAR|GETDATE\(\)|CONVERT\()/.test(up)) return 'transactsql'
    return 'sql'
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
