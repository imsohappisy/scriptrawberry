import { describe, it, expect } from 'vitest';
import { Parser } from '../parser';
import { Checker, CheckerError } from '../checker';

describe('Checker', () => {
  it('should pass valid programs', () => {
    const parser = new Parser('let x: u3 = 5b3; let y = x + 1b3;');
    const ast = parser.parse();
    const checker = new Checker();
    expect(() => checker.check(ast)).not.toThrow();
  });

  it('should throw E001 LiteralOverflow when value exceeds bounds', () => {
    const parser = new Parser('let x: u3 = 8b3;');
    const ast = parser.parse();
    const checker = new Checker();
    
    expect(() => checker.check(ast)).toThrowError(CheckerError);
    try {
      checker.check(ast);
    } catch (e: any) {
      expect(e.code).toBe('E001');
    }
  });

  it('should throw E002 ImplicitCast when assigning incompatible types', () => {
    // Assigning a boolean literal to an integer type should fail
    const parser = new Parser('let x: u3 = true;');
    const ast = parser.parse();
    const checker = new Checker();
    
    expect(() => checker.check(ast)).toThrowError(CheckerError);
    try {
      checker.check(ast);
    } catch (e: any) {
      expect(e.code).toBe('E002');
    }
  });

  it('should allow same-family integer operations (u3 + u4 in relaxed mode)', () => {
    const parser = new Parser('let x: u3 = 5b3; let y: u4 = 2b4; let z = x + y;');
    const ast = parser.parse();
    const checker = new Checker();
    expect(() => checker.check(ast)).not.toThrow();
  });
});
