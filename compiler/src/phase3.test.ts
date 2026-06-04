import { describe, it, expect } from 'vitest';
import { Parser } from './parser';
import { Checker, CheckerError } from './checker';
import { CodeGenerator } from './codegen';

describe('Phase 3: Enum Declaration', () => {
  it('should parse and register enum with variants', () => {
    const code = `
      enum Command {
        Start,
        Stop,
        SetSpeed { value: u8 },
      }
      fn main(): u32 { return 0; }
    `;
    const parser = new Parser(code);
    const ast = parser.parse();
    const checker = new Checker();
    checker.check(ast);
    
    const layout = checker.getEnumRegistry().get('Command');
    expect(layout).toBeDefined();
    expect(layout!.variants.length).toBe(3);
    expect(layout!.variants[0].name).toBe('Start');
    expect(layout!.variants[0].index).toBe(0);
    expect(layout!.variants[2].name).toBe('SetSpeed');
    expect(layout!.variants[2].fields).toBeDefined();
    expect(layout!.tagBits).toBe(2); // ceil(log2(3)) = 2
  });
});

describe('Phase 3: Const Declaration', () => {
  it('should parse const and inline at usage site', () => {
    const code = `
      const MAX_SPEED: u8 = 255;
      fn getMax(): u32 {
        return MAX_SPEED;
      }
    `;
    const parser = new Parser(code);
    const ast = parser.parse();
    const checker = new Checker();
    checker.check(ast);
    const codegen = new CodeGenerator(ast, checker);
    const wat = codegen.generate();
    
    // Should inline the const value, NOT emit a local.get
    expect(wat).toContain('i32.const 255');
    expect(wat).not.toContain('local.get $MAX_SPEED');
  });
});

describe('Phase 3: Match Expression', () => {
  it('should generate match as nested if/else blocks', () => {
    const code = `
      enum Direction {
        Up,
        Down,
        Left,
        Right,
      }
      fn handle(dir: u32): u32 {
        let mut result: u32 = 0;
        match dir {
          Direction::Up => { result = 1; },
          Direction::Down => { result = 2; },
          Direction::Left => { result = 3; },
          Direction::Right => { result = 4; },
        }
        return result;
      }
    `;
    const parser = new Parser(code);
    const ast = parser.parse();
    const checker = new Checker();
    checker.check(ast);
    const codegen = new CodeGenerator(ast, checker);
    const wat = codegen.generate();
    
    expect(wat).toContain('MATCH');
    expect(wat).toContain('i32.eq');
    expect(wat).toContain('if');
    expect(wat).toContain('END MATCH');
  });

  it('should detect non-exhaustive match (E005)', () => {
    const code = `
      enum Color { Red, Green, Blue }
      fn test(c: Color): u32 {
        match c {
          Color::Red => { return 1; },
        }
        return 0;
      }
    `;
    const parser = new Parser(code);
    const ast = parser.parse();
    const checker = new Checker();
    
    expect(() => checker.check(ast)).toThrowError(CheckerError);
    try {
      checker.check(ast);
    } catch (e: any) {
      expect(e.code).toBe('E005');
    }
  });

  it('should allow wildcard to satisfy exhaustiveness', () => {
    const code = `
      enum Color { Red, Green, Blue }
      fn test(c: Color): u32 {
        let mut result: u32 = 0;
        match c {
          Color::Red => { result = 1; },
          _ => { result = 0; },
        }
        return result;
      }
    `;
    const parser = new Parser(code);
    const ast = parser.parse();
    const checker = new Checker();
    expect(() => checker.check(ast)).not.toThrow();
  });
});

describe('Phase 3: Annotations', () => {
  it('should parse @export annotation on functions', () => {
    const code = `
      @export
      fn add(a: u32, b: u32): u32 {
        return a + b;
      }
    `;
    const parser = new Parser(code);
    const ast = parser.parse();
    
    const fn = ast.body[0] as any;
    expect(fn.type).toBe('FunctionDeclaration');
    expect(fn.modifiers).toContain('export');
  });
});
