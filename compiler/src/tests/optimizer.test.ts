import { describe, it, expect } from 'vitest';
import { Parser } from '../parser';
import { ASTOptimizer } from '../optimizer';
import * as AST from '../ast';

describe('ASTOptimizer', () => {
  it('should fold simple constant arithmetic expressions', () => {
    const code = `
      fn test(): u32 {
        let x = 10 + 20 * 30 / 15 - 5;
        return x;
      }
    `;
    const parser = new Parser(code);
    let ast = parser.parse();
    const optimizer = new ASTOptimizer();
    ast = optimizer.optimize(ast);

    // Get the initializer value for x: should be folded to 10 + 600 / 15 - 5 = 10 + 40 - 5 = 45
    const fn = ast.body[0] as AST.FunctionDeclaration;
    const body = fn.body.body;
    const decl = body[0] as AST.VariableDeclaration;
    expect(decl.init!.type).toBe('Literal');
    expect((decl.init as AST.Literal).value).toBe(45);
  });

  it('should optimize dead branch pruning in IfStatement', () => {
    const code = `
      fn test(): u32 {
        if true {
          return 1;
        } else {
          return 2;
        }
      }
    `;
    const parser = new Parser(code);
    let ast = parser.parse();
    const optimizer = new ASTOptimizer();
    ast = optimizer.optimize(ast);

    const fn = ast.body[0] as AST.FunctionDeclaration;
    const body = fn.body.body;
    // Consequent block of true branch should replace the entire IfStatement
    expect(body.length).toBe(1);
    expect(body[0]!.type).toBe('BlockStatement');
    const innerBlock = body[0] as AST.BlockStatement;
    expect(innerBlock.body[0]!.type).toBe('ReturnStatement');
    expect(((innerBlock.body[0] as AST.ReturnStatement).argument as AST.Literal).value).toBe("1");
  });

  it('should propagate constant values in expressions', () => {
    const code = `
      const SPEED: u32 = 100;
      fn getSpeed(): u32 {
        return SPEED + 50;
      }
    `;
    const parser = new Parser(code);
    let ast = parser.parse();
    const optimizer = new ASTOptimizer();
    ast = optimizer.optimize(ast);

    const fn = ast.body[1] as AST.FunctionDeclaration;
    const ret = fn.body.body[0] as AST.ReturnStatement;
    expect(ret.argument!.type).toBe('Literal');
    expect((ret.argument as AST.Literal).value).toBe(150);
  });
});
