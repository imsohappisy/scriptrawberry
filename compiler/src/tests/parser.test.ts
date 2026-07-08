import { describe, it, expect } from 'vitest';
import { Parser } from '../parser';

describe('Parser', () => {
  it('should parse a basic function', () => {
    const parser = new Parser('fn add(a: u3, b: u3): u3 { return a + b; }');
    const ast = parser.parse();
    
    expect(ast.body.length).toBe(1);
    const func = ast.body[0] as any;
    expect(func.type).toBe('FunctionDeclaration');
    expect(func.name.name).toBe('add');
    expect(func.params.length).toBe(2);
    expect(func.returnType.name).toBe('u3');
    expect(func.body.body.length).toBe(1);
  });

  it('should parse variable declarations', () => {
    const parser = new Parser('let mut x: u3 = 5b3; let y = x + 1;');
    const ast = parser.parse();
    
    expect(ast.body.length).toBe(2);
    
    const var1 = ast.body[0] as any;
    expect(var1.type).toBe('VariableDeclaration');
    expect(var1.name.name).toBe('x');
    expect(var1.isMut).toBe(true);
    expect(var1.varType.name).toBe('u3');
    expect(var1.init.value).toBe('5b3');

    const var2 = ast.body[1] as any;
    expect(var2.type).toBe('VariableDeclaration');
    expect(var2.isMut).toBe(false);
    expect(var2.init.type).toBe('BinaryExpression');
  });
});
