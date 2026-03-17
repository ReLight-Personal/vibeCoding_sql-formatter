/** 예약어 대소문자 */
export type KeywordCase = 'upper' | 'lower' | 'preserve'

/** 콤마 위치: 앞(leading) vs 뒤(trailing) */
export type CommaPosition = 'leading' | 'trailing'

/** 들여쓰기 방식 */
export type IndentType = 'spaces' | 'tabs' | 'auto'

/** 적용 가능한 포매팅 규칙 상태 */
export interface FormatRulesState {
  /** 예약어 대소문자 변환 사용 여부 */
  keywordCaseEnabled: boolean
  keywordCase: KeywordCase

  /** 콤마 위치 규칙 사용 여부 */
  commaPositionEnabled: boolean
  commaPosition: CommaPosition

  /** 들여쓰기 규칙 사용 여부 */
  indentEnabled: boolean
  indentType: IndentType
  tabWidth: number

  /** 연산자 주변 공백 규칙 (denseOperators: true면 공백 없음) */
  operatorSpacingEnabled: boolean
  denseOperators: boolean
}

export const defaultFormatRules: FormatRulesState = {
  keywordCaseEnabled: true,
  keywordCase: 'upper',

  commaPositionEnabled: true,
  commaPosition: 'trailing',

  indentEnabled: true,
  indentType: 'spaces',
  tabWidth: 2,

  operatorSpacingEnabled: false,
  denseOperators: false,
}
