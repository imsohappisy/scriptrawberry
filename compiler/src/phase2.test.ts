import { describe, it, expect } from 'vitest';
import { Parser } from './parser';
import { Checker } from './checker';
import { CodeGenerator } from './codegen';

describe('Phase 2: Struct Declaration & Instantiation', () => {
  it('should parse and check struct declarations', () => {
    const code = `
      struct ObjectState {
        id: u16;
        active: u1;
        category: u3;
        priority: u4;
      }
      fn main(): u32 {
        return 0;
      }
    `;
    const parser = new Parser(code);
    const ast = parser.parse();
    const checker = new Checker();
    checker.check(ast);
    
    const layout = checker.getStructRegistry().get('ObjectState');
    expect(layout).toBeDefined();
    expect(layout!.totalBits).toBe(24); // 16+1+3+4
    expect(layout!.paddedBytes).toBe(4); // ceil(24/32)*4
    expect(layout!.fields.length).toBe(4);
    expect(layout!.fields[0].bitOffset).toBe(0);
    expect(layout!.fields[1].bitOffset).toBe(16);
    expect(layout!.fields[2].bitOffset).toBe(17);
    expect(layout!.fields[3].bitOffset).toBe(20);
  });

  it('should generate WAT with linear memory for struct instantiation', () => {
    const code = `
      struct Vec2 {
        x: u16;
        y: u16;
      }
      fn make(): u32 {
        let v = Vec2 { x: 10, y: 20 };
        return v.x;
      }
    `;
    const parser = new Parser(code);
    const ast = parser.parse();
    const checker = new Checker();
    checker.check(ast);
    const codegen = new CodeGenerator(ast, checker);
    const wat = codegen.generate();
    
    expect(wat).toContain('(memory');
    expect(wat).toContain('global $__stack_ptr');
    expect(wat).toContain('i32.store');
    expect(wat).toContain('i32.load');
  });
});

describe('Phase 2: If/Else', () => {
  it('should generate if/else WAT blocks', () => {
    const code = `
      fn check(x: u3): u3 {
        let result: u3 = 0b3;
        if x > 4b3 {
          result = 7b3;
        } else {
          result = 1b3;
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
    
    expect(wat).toContain('if');
    expect(wat).toContain('else');
    expect(wat).toContain('end');
    expect(wat).toContain('i32.gt_u');
  });
});

describe('Phase 2: While loop', () => {
  it('should generate while loop as block+loop WAT', () => {
    const code = `
      fn count(): u32 {
        let mut i: u32 = 0;
        while i < 10 {
          i = i + 1;
        }
        return i;
      }
    `;
    const parser = new Parser(code);
    const ast = parser.parse();
    const checker = new Checker();
    checker.check(ast);
    const codegen = new CodeGenerator(ast, checker);
    const wat = codegen.generate();
    
    expect(wat).toContain('block');
    expect(wat).toContain('loop');
    expect(wat).toContain('br_if');
    expect(wat).toContain('br');
  });
});

describe('Phase 2: For loop unrolling', () => {
  it('should unroll for loop at AST level', () => {
    const code = `
      fn sumFour(): u32 {
        let mut total: u32 = 0;
        for i in 0..4 {
          total = total + 1;
        }
        return total;
      }
    `;
    const parser = new Parser(code);
    const ast = parser.parse();
    const checker = new Checker();
    checker.check(ast);
    const codegen = new CodeGenerator(ast, checker);
    const wat = codegen.generate();
    
    // Should NOT contain loop/block/br — fully unrolled
    expect(wat).not.toContain('loop');
    expect(wat).not.toContain('br_if');
    // Should contain 4 iterations
    expect(wat).toContain('iteration i = 0');
    expect(wat).toContain('iteration i = 1');
    expect(wat).toContain('iteration i = 2');
    expect(wat).toContain('iteration i = 3');
    expect(wat).toContain('UNROLLED');
  });
});
