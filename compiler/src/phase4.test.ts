import { describe, it, expect } from 'vitest';
import { Parser } from './parser';
import { Checker, CheckerError } from './checker';
import { CodeGenerator } from './codegen';

describe('Phase 4: Arrays and Pointers', () => {
  it('should parse array types and literals', () => {
    const code = `
      fn main(): u32 {
        let arr: [u32; 3] = [10, 20, 30];
        return arr[1];
      }
    `;
    const parser = new Parser(code);
    const ast = parser.parse();
    const checker = new Checker();
    checker.check(ast);
    const codegen = new CodeGenerator(ast, checker);
    const wat = codegen.generate();

    // Check linear memory allocation
    expect(wat).toContain('global.get $__stack_ptr');
    expect(wat).toContain('i32.sub');
    
    // Check array elements storage
    expect(wat).toContain('i32.const 10');
    expect(wat).toContain('i32.const 20');
    expect(wat).toContain('i32.const 30');
    expect(wat).toContain('i32.store');
    
    // Check array indexing (address + index * 4)
    expect(wat).toContain('i32.const 4');
    expect(wat).toContain('i32.mul');
    expect(wat).toContain('i32.add');
    expect(wat).toContain('i32.load');
  });

  it('should support pointer referencing and dereferencing', () => {
    const code = `
      fn updateValue(ptr: &mut u32): u32 {
        *ptr = *ptr + 5;
        return 0;
      }
      fn main(): u32 {
        let mut x: u32 = 10;
        let p = &mut x;
        *p = 20;
        updateValue(&mut x);
        return x;
      }
    `;
    const parser = new Parser(code);
    const ast = parser.parse();
    const checker = new Checker();
    checker.check(ast);
    
    // x should be marked as address taken
    expect(checker.getAddressTakenVars().has('x')).toBe(true);

    const codegen = new CodeGenerator(ast, checker);
    const wat = codegen.generate();

    // x should be allocated on stack because its address is taken
    expect(wat).toContain('Allocate 4 bytes on stack');
    expect(wat).toContain('local.get $x__ptr');
    expect(wat).toContain('i32.load');
  });

  it('should reject invalid array indexing', () => {
    const code = `
      fn main(): u32 {
        let x: u32 = 10;
        return x[0]; // x is not an array
      }
    `;
    const parser = new Parser(code);
    const ast = parser.parse();
    const checker = new Checker();

    expect(() => checker.check(ast)).toThrowError(/Cannot index into non-array type/);
  });

  it('should reject dereferencing non-pointers', () => {
    const code = `
      fn main(): u32 {
        let x: u32 = 10;
        return *x; // x is not a pointer
      }
    `;
    const parser = new Parser(code);
    const ast = parser.parse();
    const checker = new Checker();

    expect(() => checker.check(ast)).toThrowError(/Cannot dereference non-pointer type/);
  });
});
