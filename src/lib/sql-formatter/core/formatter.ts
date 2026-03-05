import type { SqlToken } from '../types/token'
import type { FormatterConfig, FormatOptions } from '../types/config'
import type { AstNode } from './parser'
import { SqlTokenizer } from './tokenizer'
import { SqlParser } from './parser'

export class SqlFormatter {
  private tokenizer: SqlTokenizer
  private parser: SqlParser
  private config: FormatterConfig

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
      ...config
    }

    this.tokenizer = new SqlTokenizer()
    this.parser = new SqlParser()
  }

  format(sql: string, options: FormatOptions = {}): string {
    const finalConfig = { ...this.config, ...options }
    
    try {
      // 1. 토큰화
      const tokens = this.tokenizer.tokenize(sql)
      
      // 2. 파싱
      const ast = this.parser.parse(tokens)
      
      // 3. 포매팅
      return this.formatAst(ast, finalConfig)
    } catch (error) {
      console.warn('SQL 포매팅 실패:', error)
      return sql // 실패 시 원본 반환
    }
  }

  private formatAst(ast: AstNode[], config: FormatterConfig): string {
    const lines: string[] = []
    
    for (const node of ast) {
      const formattedNode = this.formatNode(node, config, 0)
      lines.push(formattedNode)
    }
    
    return lines.join('\n')
  }

  private formatNode(node: AstNode, config: FormatterConfig, indentLevel: number): string {
    switch (node.type) {
      case 'select_statement':
        return this.formatSelectStatement(node, config, indentLevel)
      case 'generic_statement':
        return this.formatGenericStatement(node, config)
      default:
        return this.formatTokens(node.tokens, config)
    }
  }

  private formatSelectStatement(node: AstNode, config: FormatterConfig, indentLevel: number): string {
    const lines: string[] = []

    // SELECT 절
    const selectClause = node.children?.find(child => child.type === 'select_clause')
    if (selectClause) {
      const selectTokens = this.applyKeywordCase(selectClause.tokens, config)
      const formattedSelect = this.formatSelectClause(selectTokens, config, indentLevel)
      lines.push(formattedSelect)
    }

    // FROM 절
    const fromClause = node.children?.find(child => child.type === 'from_clause')
    if (fromClause) {
      const fromTokens = this.applyKeywordCase(fromClause.tokens, config)
      const formattedFrom = this.formatFromClause(fromTokens, config, indentLevel)
      lines.push(formattedFrom)
    }

    // WHERE 절
    const whereClause = node.children?.find(child => child.type === 'where_clause')
    if (whereClause) {
      const whereTokens = this.applyKeywordCase(whereClause.tokens, config)
      const formattedWhere = this.formatWhereClause(whereTokens, config, indentLevel)
      lines.push(formattedWhere)
    }

    return lines.join('\n')
  }

  private formatSelectClause(tokens: SqlToken[], config: FormatterConfig, indentLevel: number): string {
    const indent = this.getIndent(config, indentLevel)
    const nextIndent = this.getIndent(config, indentLevel + 1)
    
    // SELECT 키워드 분리
    const selectKeyword = tokens.find(t => t.type === 'keyword' && t.value.toUpperCase() === 'SELECT')
    const remainingTokens = tokens.slice(tokens.indexOf(selectKeyword!) + 1)
    
    // 컬럼 리스트 포매팅
    const columns = this.groupColumns(remainingTokens)
    const formattedColumns = columns.map((col, index) => {
      const formattedCol = this.formatTokens(col, config)
      const comma = config.commaPosition === 'leading' && index > 0 ? ',' : ''
      const trailingComma = config.commaPosition === 'trailing' && index < columns.length - 1 ? ',' : ''
      
      if (config.commaPosition === 'leading') {
        return `${comma}${nextIndent}${formattedCol}${trailingComma}`
      } else {
        return `${nextIndent}${formattedCol}${trailingComma}`
      }
    })

    return `${indent}SELECT\n${formattedColumns.join('\n')}`
  }

  private formatFromClause(tokens: SqlToken[], config: FormatterConfig, indentLevel: number): string {
    const indent = this.getIndent(config, indentLevel)
    const nextIndent = this.getIndent(config, indentLevel + 1)
    
    // FROM 키워드 분리
    const fromKeyword = tokens.find(t => t.type === 'keyword' && t.value.toUpperCase() === 'FROM')
    const remainingTokens = tokens.slice(tokens.indexOf(fromKeyword!) + 1)
    
    const formattedTables = this.formatTokens(remainingTokens, config)
    
    return `${indent}FROM\n${nextIndent}${formattedTables}`
  }

  private formatWhereClause(tokens: SqlToken[], config: FormatterConfig, indentLevel: number): string {
    const indent = this.getIndent(config, indentLevel)
    const nextIndent = this.getIndent(config, indentLevel + 1)
    
    // WHERE 키워드 분리
    const whereKeyword = tokens.find(t => t.type === 'keyword' && t.value.toUpperCase() === 'WHERE')
    const remainingTokens = tokens.slice(tokens.indexOf(whereKeyword!) + 1)
    
    const formattedConditions = this.formatTokens(remainingTokens, config)
    
    return `${indent}WHERE\n${nextIndent}${formattedConditions}`
  }

  private formatGenericStatement(node: AstNode, config: FormatterConfig): string {
    const tokens = this.applyKeywordCase(node.tokens, config)
    return this.formatTokens(tokens, config)
  }

  private formatTokens(tokens: SqlToken[], config: FormatterConfig): string {
    const processedTokens = this.applyOperatorSpacing(tokens, config)
    
    return processedTokens
      .filter(token => token.type !== 'whitespace')
      .map(token => token.value)
      .join(' ')
  }

  private applyKeywordCase(tokens: SqlToken[], config: FormatterConfig): SqlToken[] {
    return tokens.map(token => {
      if (token.type === 'keyword') {
        switch (config.keywordCase) {
          case 'upper':
            return { ...token, value: token.value.toUpperCase() }
          case 'lower':
            return { ...token, value: token.value.toLowerCase() }
          case 'preserve':
          default:
            return token
        }
      }
      return token
    })
  }

  private applyOperatorSpacing(tokens: SqlToken[], config: FormatterConfig): SqlToken[] {
    if (config.denseOperators) {
      return tokens.map(token => {
        if (token.type === 'operator') {
          return { ...token, value: token.value.trim() }
        }
        return token
      })
    }
    
    return tokens
  }

  private groupColumns(tokens: SqlToken[]): SqlToken[][] {
    const columns: SqlToken[][] = []
    let currentColumn: SqlToken[] = []
    let parenthesesLevel = 0

    for (const token of tokens) {
      if (token.type === 'comma' && parenthesesLevel === 0) {
        if (currentColumn.length > 0) {
          columns.push(currentColumn)
          currentColumn = []
        }
      } else {
        currentColumn.push(token)
        if (token.type === 'parenthesis') {
          if (token.value === '(') parenthesesLevel++
          else if (token.value === ')') parenthesesLevel--
        }
      }
    }

    if (currentColumn.length > 0) {
      columns.push(currentColumn)
    }

    return columns
  }

  private getIndent(config: FormatterConfig, level: number): string {
    if (config.indentType === 'tabs') {
      return '\t'.repeat(level)
    } else {
      return ' '.repeat(level * config.tabWidth)
    }
  }

  // 유틸리티 메서드
  detectDialect(sql: string): 'sql' | 'plsql' | 'mysql' | 'postgresql' | 'transactsql' {
    const upperSql = sql.toUpperCase()
    
    // PL/SQL 키워드 감지
    if (/\b(DECLARE|BEGIN|END|PROCEDURE|FUNCTION|PACKAGE|TRIGGER|CURSOR|EXCEPTION)\b/.test(upperSql)) {
      return 'plsql'
    }
    
    // MySQL 특정 문법
    if (/\b(LIMIT|AUTO_INCREMENT|TINYINT|ENUM|SET|SHOW|DESCRIBE)\b/.test(upperSql)) {
      return 'mysql'
    }
    
    // PostgreSQL 특정 문법
    if (/\b(SERIAL|BIGSERIAL|BYTEA|JSONB|ARRAY|ILIKE|EXCLUDE)\b/.test(upperSql)) {
      return 'postgresql'
    }
    
    // SQL Server (T-SQL)
    if (/\b(TOP|IDENTITY|NVARCHAR|VARCHAR|GETDATE\(\)|CONVERT\()\b/.test(upperSql)) {
      return 'transactsql'
    }
    
    return 'sql'
  }

  validate(sql: string): { isValid: boolean; errors: string[] } {
    try {
      this.tokenizer.tokenize(sql)
      return { isValid: true, errors: [] }
    } catch (error) {
      return { 
        isValid: false, 
        errors: [error instanceof Error ? error.message : 'Unknown error'] 
      }
    }
  }
}
