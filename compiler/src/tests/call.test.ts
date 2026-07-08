import { describe, it, expect } from 'vitest';
import { Parser } from '../parser';
import { Checker, CheckerError } from '../checker';
import { CodeGenerator } from '../codegen';

describe('Function Call Expression', () => {
  it('should parse and compile a basic function call', () => {
    const code = `
      fn add(a: u32, b: u32): u32 {
        return a + b;
      }
      fn main(): u32 {
        return add(3, 4);
      }
    `;
    const parser = new Parser(code);
    const ast = parser.parse();
    const checker = new Checker();
    checker.check(ast);
    const codegen = new CodeGenerator(ast, checker);
    const wat = codegen.generate();

    expect(wat).toContain('call $add');
    expect(wat).toContain('i32.const 3');
    expect(wat).toContain('i32.const 4');
  });

  it('should support nested function calls', () => {
    const code = `
      fn double(x: u32): u32 {
        return x * 2;
      }
      fn quadruple(x: u32): u32 {
        return double(double(x));
      }
    `;
    const parser = new Parser(code);
    const ast = parser.parse();
    const checker = new Checker();
    checker.check(ast);
    const codegen = new CodeGenerator(ast, checker);
    const wat = codegen.generate();

    // Should have two call $double instructions
    const matches = wat.match(/call \$double/g);
    expect(matches).toHaveLength(2);
  });

  it('should support zero-argument function calls', () => {
    const code = `
      fn getAnswer(): u32 {
        return 42;
      }
      fn main(): u32 {
        return getAnswer();
      }
    `;
    const parser = new Parser(code);
    const ast = parser.parse();
    const checker = new Checker();
    checker.check(ast);
    const codegen = new CodeGenerator(ast, checker);
    const wat = codegen.generate();

    expect(wat).toContain('call $getAnswer');
  });

  it('should use call result in expressions', () => {
    const code = `
      fn square(x: u32): u32 {
        return x * x;
      }
      fn main(): u32 {
        let result: u32 = square(5) + 1;
        return result;
      }
    `;
    const parser = new Parser(code);
    const ast = parser.parse();
    const checker = new Checker();
    checker.check(ast);
    const codegen = new CodeGenerator(ast, checker);
    const wat = codegen.generate();

    expect(wat).toContain('call $square');
    expect(wat).toContain('i32.add');
  });

  it('should detect undefined function calls (E006)', () => {
    const code = `
      fn main(): u32 {
        return notDefined(1);
      }
    `;
    const parser = new Parser(code);
    const ast = parser.parse();
    const checker = new Checker();

    expect(() => checker.check(ast)).toThrowError(CheckerError);
    try {
      checker.check(ast);
    } catch (e: any) {
      expect(e.code).toBe('E006');
    }
  });

  it('should detect wrong argument count (E007)', () => {
    const code = `
      fn add(a: u32, b: u32): u32 {
        return a + b;
      }
      fn main(): u32 {
        return add(1);
      }
    `;
    const parser = new Parser(code);
    const ast = parser.parse();
    const checker = new Checker();

    expect(() => checker.check(ast)).toThrowError(CheckerError);
    try {
      checker.check(ast);
    } catch (e: any) {
      expect(e.code).toBe('E007');
    }
  });

  it('should support function call as statement (side-effect only)', () => {
    const code = `
      fn doNothing(): u32 {
        return 0;
      }
      fn main(): u32 {
        doNothing();
        return 1;
      }
    `;
    const parser = new Parser(code);
    const ast = parser.parse();
    const checker = new Checker();
    checker.check(ast);
    const codegen = new CodeGenerator(ast, checker);
    const wat = codegen.generate();

    expect(wat).toContain('call $doNothing');
    // Side-effect call should drop the return value
    expect(wat).toContain('drop');
  });
});
