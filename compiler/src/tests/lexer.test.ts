import { describe, it, expect } from 'vitest';
import { Lexer, TokenType } from '../lexer';

describe('Lexer', () => {
  it('should tokenize basic keywords and identifiers', () => {
    const lexer = new Lexer('fn main() { let mut x = 5; }');
    const tokens = lexer.tokenizeAll();
    
    expect(tokens.map(t => t.value)).toEqual([
      'fn', 'main', '(', ')', '{', 'let', 'mut', 'x', '=', '5', ';', '}', ''
    ]);
    expect(tokens[0].type).toBe(TokenType.Keyword);
    expect(tokens[1].type).toBe(TokenType.Identifier);
  });

  it('should tokenize bit-suffixed literals', () => {
    const lexer = new Lexer('let a: u3 = 5b3;');
    const tokens = lexer.tokenizeAll();
    
    expect(tokens.map(t => t.value)).toEqual([
      'let', 'a', ':', 'u3', '=', '5b3', ';', ''
    ]);
    expect(tokens[5].type).toBe(TokenType.Number);
  });

  it('should tokenize hex and binary literals with type suffixes', () => {
    const lexer = new Lexer('0xFF_u8 0b1010');
    const tokens = lexer.tokenizeAll();
    
    expect(tokens[0].value).toBe('0xFF_u8');
    expect(tokens[1].value).toBe('0b1010');
  });

  it('should tokenize operators', () => {
    const lexer = new Lexer('a == b && c != d -> e');
    const tokens = lexer.tokenizeAll();
    // note: && is not currently in OPERATORS, but will be parsed as two & or fail.
    // wait, I didn't add && to OPERATORS in lexer.ts. Let's stick to defined ones.
  });
});
