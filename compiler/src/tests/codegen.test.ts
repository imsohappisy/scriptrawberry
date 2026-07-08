import { describe, it, expect } from 'vitest';
import { Parser } from '../parser';
import { Checker } from '../checker';
import { CodeGenerator } from '../codegen';

describe('CodeGenerator', () => {
  it('should generate valid WAT with bit masking', () => {
    const code = `
      fn calculate(a: u3, b: u3): u3 {
        let x: u3 = a + b;
        return x;
      }
    `;
    const parser = new Parser(code);
    const ast = parser.parse();
    
    const checker = new Checker();
    checker.check(ast);

    const codegen = new CodeGenerator(ast, checker);
    const wat = codegen.generate();
    
    expect(wat).toContain('(module');
    expect(wat).toContain('(func $calculate');
    expect(wat).toContain('local.get $a');
    expect(wat).toContain('local.get $b');
    expect(wat).toContain('i32.add');
    expect(wat).toContain('i32.const 7'); // The bit mask for u3
    expect(wat).toContain('i32.and');
  });
});
