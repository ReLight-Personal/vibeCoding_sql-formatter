import { formatWithRules, formatPlSql } from './customSqlFormatter'
import type { FormatRulesState } from '../types/formatRules'

// 테스트용 기본 규칙
const testRules: FormatRulesState = {
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

// 테스트 케이스
const testCases = [
  {
    name: '기본 SELECT 문',
    input: 'select id, name, email from users where active = 1',
    expected: 'SELECT\n  id,\n  name,\n  email\nFROM\n  users\nWHERE\n  active = 1'
  },
  {
    name: 'PL/SQL 블록',
    input: 'declare v_name varchar2(100); begin select name into v_name from users where id = 1; end;',
    expected: 'DECLARE\n  v_name VARCHAR2(100);\nBEGIN\n  SELECT\n    name\n  INTO\n    v_name\n  FROM\n    users\n  WHERE\n    id = 1;\nEND;'
  },
  {
    name: '복잡한 JOIN',
    input: 'select u.id, u.name, p.title from users u join posts p on u.id = p.user_id where u.active = 1 order by u.name',
    expected: 'SELECT\n  u.id,\n  u.name,\n  p.title\nFROM\n  users u\n  JOIN posts p ON u.id = p.user_id\nWHERE\n  u.active = 1\nORDER BY\n  u.name'
  }
]

// 테스트 실행
export function runTests() {
  console.log('=== Custom SQL Formatter 테스트 ===\n')
  
  testCases.forEach((testCase, index) => {
    console.log(`테스트 ${index + 1}: ${testCase.name}`)
    console.log(`입력: ${testCase.input}`)
    
    try {
      const result = testCase.name.includes('PL/SQL') 
        ? formatPlSql(testCase.input, testRules)
        : formatWithRules(testCase.input, testRules)
      
      console.log(`결과:\n${result}`)
      console.log(`예상:\n${testCase.expected}`)
      console.log(`성공: ${result === testCase.expected ? '✅' : '❌'}`)
    } catch (error) {
      console.log(`에러: ${error}`)
    }
    
    console.log('---\n')
  })
}

// 개발용 테스트
if (typeof window === 'undefined') {
  // Node.js 환경에서만 실행
  runTests()
}
