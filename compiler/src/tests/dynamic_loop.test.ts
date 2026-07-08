import { describe, it, expect } from 'vitest';
import { Parser } from '../parser';
import { Checker } from '../checker';
import { CodeGenerator } from '../codegen';

describe('Dynamic Loop Compilation', () => {
  it('should compile loops with dynamic bounds (non-constants)', () => {
    const code = `
      fn loop_dynamic(n: u32): u32 {
        let mut sum: u32 = 0;
        for i in 0..n {
          sum = sum + i;
        }
        return sum;
      }
    `;
    const parser = new Parser(code);
    const ast = parser.parse();
    const checker = new Checker();
    checker.check(ast);
    const codegen = new CodeGenerator(ast, checker);
    const wat = codegen.generate();

    expect(wat).toContain('block $for_block_');
    expect(wat).toContain('loop $for_loop_');
    expect(wat).toContain('i32.ge_s');
    expect(wat).toContain('br_if $for_block_');
    expect(wat).toContain('br $for_loop_');
    expect(wat).toContain('i32.const 1');
    expect(wat).toContain('i32.add');
  });

  it('should compile loop exceeding unroll threshold (range > 16) as dynamic loop', () => {
    const code = `
      fn loop_large(): u32 {
        let mut sum: u32 = 0;
        for i in 0..20 {
          sum = sum + i;
        }
        return sum;
      }
    `;
    const parser = new Parser(code);
    const ast = parser.parse();
    const checker = new Checker();
    checker.check(ast);
    const codegen = new CodeGenerator(ast, checker);
    const wat = codegen.generate();

    expect(wat).toContain('block $for_block_');
    expect(wat).toContain('loop $for_loop_');
    expect(wat).not.toContain(';; === UNROLLED for i in 0..20 ===');
  });

  it('should unroll loops within threshold (range <= 16)', () => {
    const code = `
      fn loop_small(): u32 {
        let mut sum: u32 = 0;
        for i in 0..5 {
          sum = sum + i;
        }
        return sum;
      }
    `;
    const parser = new Parser(code);
    const ast = parser.parse();
    const checker = new Checker();
    checker.check(ast);
    const codegen = new CodeGenerator(ast, checker);
    const wat = codegen.generate();

    expect(wat).not.toContain('block $for_block_');
    expect(wat).toContain(';; === UNROLLED for i in 0..5 ===');
  });
});
