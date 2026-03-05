import { SqlFormatter } from './core/formatter'
import { SqlParser } from './core/parser'
import { SqlTokenizer } from './core/tokenizer'
import type { FormatOptions } from './types/config'

export type {
  SqlToken,
  TokenType,
  Position,
  TokenPattern
} from './types/token'

export type {
  SqlDialect,
  KeywordCase,
  IndentType,
  CommaPosition,
  FormatterConfig,
  FormatOptions
} from './types/config'

export { SqlTokenizer, SqlParser, SqlFormatter }

// 간편 함수들
export function formatSql(sql: string, options?: FormatOptions): string {
  const formatter = new SqlFormatter(options)
  return formatter.format(sql)
}

export function formatPlSql(sql: string, options?: FormatOptions): string {
  const formatter = new SqlFormatter(options)
  return formatter.format(sql, { ...options, dialect: 'plsql' })
}

export function formatMySql(sql: string, options?: FormatOptions): string {
  const formatter = new SqlFormatter(options)
  return formatter.format(sql, { ...options, dialect: 'mysql' })
}

export function formatPostgreSql(sql: string, options?: FormatOptions): string {
  const formatter = new SqlFormatter(options)
  return formatter.format(sql, { ...options, dialect: 'postgresql' })
}

export function formatTSql(sql: string, options?: FormatOptions): string {
  const formatter = new SqlFormatter(options)
  return formatter.format(sql, { ...options, dialect: 'transactsql' })
}
