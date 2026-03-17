export type SqlDialect = 'sql' | 'plsql' | 'mysql' | 'postgresql' | 'transactsql' | 'mybatis'

export type KeywordCase = 'upper' | 'lower' | 'preserve'
export type IndentType = 'spaces' | 'tabs' | 'auto'
export type CommaPosition = 'leading' | 'trailing'

export interface FormatterConfig {
  defaultDialect: SqlDialect
  maxLineLength: number
  indentType: IndentType
  keywordCase: KeywordCase
  tabWidth: number
  commaPosition: CommaPosition
  denseOperators: boolean
  lineBreakStyle: 'unix' | 'windows'
}

export interface FormatOptions extends Partial<FormatterConfig> {
  dialect?: SqlDialect
  templateType?: 'none' | 'mybatis'
}
