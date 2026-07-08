import * as AST from './ast';
import { parseLiteral } from './literals';

export class ASTOptimizer {
  private consts = new Map<string, AST.ASTNode>();

  constructor() {}

  public optimize(program: AST.Program): AST.Program {
    // 1. First pass: Collect all const declarations
    this.collectConstants(program);

    // 2. Second pass: Optimize all nodes recursively
    const optimizedBody: AST.ASTNode[] = [];
    for (const node of program.body) {
      const optimized = this.optimizeNode(node);
      if (optimized) {
        optimizedBody.push(optimized);
      }
    }

    return {
      ...program,
      body: optimizedBody,
    };
  }

  private collectConstants(program: AST.Program) {
    for (const node of program.body) {
      if (node.type === 'ConstDeclaration') {
        const decl = node as AST.ConstDeclaration;
        // Optimize the const value first (in case it is an expression like 1 + 2)
        const optimizedValue = this.optimizeNode(decl.value);
        if (optimizedValue) {
          decl.value = optimizedValue;
          this.consts.set(decl.name.name, optimizedValue);
        }
      }
    }
  }

  private optimizeNode(node: AST.ASTNode): AST.ASTNode | null {
    if (!node) return null;

    switch (node.type) {
      case 'Program': {
        const prog = node as AST.Program;
        return {
          ...prog,
          body: prog.body.map(n => this.optimizeNode(n)).filter(Boolean) as AST.ASTNode[],
        };
      }

      case 'FunctionDeclaration': {
        const fn = node as AST.FunctionDeclaration;
        const optimizedBody = this.optimizeNode(fn.body) as AST.BlockStatement;
        return {
          ...fn,
          body: optimizedBody,
        };
      }

      case 'BlockStatement': {
        const block = node as AST.BlockStatement;
        return {
          ...block,
          body: block.body.map(n => this.optimizeNode(n)).filter(Boolean) as AST.ASTNode[],
        };
      }

      case 'VariableDeclaration': {
        const decl = node as AST.VariableDeclaration;
        if (decl.init) {
          const optInit = this.optimizeNode(decl.init);
          return {
            ...decl,
            init: optInit || undefined,
          };
        }
        return decl;
      }

      case 'ConstDeclaration': {
        const decl = node as AST.ConstDeclaration;
        const optVal = this.optimizeNode(decl.value);
        return {
          ...decl,
          value: optVal || decl.value,
        };
      }

      case 'IfStatement': {
        const ifStmt = node as AST.IfStatement;
        const optCond = this.optimizeNode(ifStmt.condition);
        
        // Dead Branch Pruning if condition is boolean literal
        if (optCond && optCond.type === 'Literal') {
          const lit = optCond as AST.Literal;
          if (typeof lit.value === 'boolean') {
            if (lit.value) {
              // Always true: return optimized consequent
              return this.optimizeNode(ifStmt.consequent);
            } else {
              // Always false: return optimized alternate (or null if none)
              if (ifStmt.alternate) {
                return this.optimizeNode(ifStmt.alternate);
              }
              // If there's no alternate, we return an empty BlockStatement so we don't return null
              return { type: 'BlockStatement', body: [] } as AST.BlockStatement;
            }
          }
        }

        const optConsequent = this.optimizeNode(ifStmt.consequent) as AST.BlockStatement;
        const optAlternate = ifStmt.alternate ? (this.optimizeNode(ifStmt.alternate) as AST.BlockStatement | AST.IfStatement) : undefined;

        return {
          ...ifStmt,
          condition: optCond || ifStmt.condition,
          consequent: optConsequent,
          alternate: optAlternate,
        } as AST.IfStatement;
      }

      case 'WhileStatement': {
        const whileStmt = node as AST.WhileStatement;
        const optCond = this.optimizeNode(whileStmt.condition);
        const optBody = this.optimizeNode(whileStmt.body) as AST.BlockStatement;
        return {
          ...whileStmt,
          condition: optCond || whileStmt.condition,
          body: optBody,
        };
      }

      case 'ForStatement': {
        const forStmt = node as AST.ForStatement;
        const optStart = this.optimizeNode(forStmt.start);
        const optEnd = this.optimizeNode(forStmt.end);
        const optBody = this.optimizeNode(forStmt.body) as AST.BlockStatement;
        return {
          ...forStmt,
          start: optStart || forStmt.start,
          end: optEnd || forStmt.end,
          body: optBody,
        };
      }

      case 'ReturnStatement': {
        const ret = node as AST.ReturnStatement;
        if (ret.argument) {
          return {
            ...ret,
            argument: this.optimizeNode(ret.argument) || undefined,
          };
        }
        return ret;
      }

      case 'AssignmentExpression': {
        const assign = node as AST.AssignmentExpression;
        const optTarget = this.optimizeNode(assign.target);
        const optVal = this.optimizeNode(assign.value);
        return {
          ...assign,
          target: optTarget || assign.target,
          value: optVal || assign.value,
        };
      }

      case 'BinaryExpression': {
        const bin = node as AST.BinaryExpression;
        const optLeft = this.optimizeNode(bin.left);
        const optRight = this.optimizeNode(bin.right);

        const left = optLeft || bin.left;
        const right = optRight || bin.right;

        // Logical Short-Circuit optimizations
        if (bin.operator === '&&') {
          if (left.type === 'Literal') {
            const lit = left as AST.Literal;
            if (lit.value === false) return { type: 'Literal', value: false, raw: 'false' } as AST.Literal;
            if (lit.value === true) return right;
          }
        }
        if (bin.operator === '||') {
          if (left.type === 'Literal') {
            const lit = left as AST.Literal;
            if (lit.value === true) return { type: 'Literal', value: true, raw: 'true' } as AST.Literal;
            if (lit.value === false) return right;
          }
        }

        // Constant Folding of Literals
        if (left.type === 'Literal' && right.type === 'Literal') {
          const val1 = this.getNumericOrBoolValue(left as AST.Literal);
          const val2 = this.getNumericOrBoolValue(right as AST.Literal);

          if (val1 !== null && val2 !== null) {
            let foldedValue: any = null;
            switch (bin.operator) {
              case '+': foldedValue = val1 + val2; break;
              case '-': foldedValue = val1 - val2; break;
              case '*': foldedValue = val1 * val2; break;
              case '/': foldedValue = val2 !== 0 ? Math.floor(val1 / val2) : 0; break;
              case '==': foldedValue = val1 === val2; break;
              case '!=': foldedValue = val1 !== val2; break;
              case '<': foldedValue = val1 < val2; break;
              case '<=': foldedValue = val1 <= val2; break;
              case '>': foldedValue = val1 > val2; break;
              case '>=': foldedValue = val1 >= val2; break;
              case '&': foldedValue = val1 & val2; break;
              case '|': foldedValue = val1 | val2; break;
            }

            if (foldedValue !== null) {
              return {
                type: 'Literal',
                value: foldedValue,
                raw: String(foldedValue),
              } as AST.Literal;
            }
          }
        }

        return {
          ...bin,
          left,
          right,
        };
      }

      case 'Identifier': {
        const id = node as AST.Identifier;
        // Constant Propagation: replace const identifiers with their actual value
        if (this.consts.has(id.name)) {
          return this.consts.get(id.name)!;
        }
        return id;
      }

      case 'StructInstantiation': {
        const inst = node as AST.StructInstantiation;
        return {
          ...inst,
          fields: inst.fields.map(f => ({
            name: f.name,
            value: this.optimizeNode(f.value) || f.value,
          })),
        };
      }

      case 'MemberExpression': {
        const mem = node as AST.MemberExpression;
        const optObj = this.optimizeNode(mem.object);
        return {
          ...mem,
          object: optObj || mem.object,
        };
      }

      case 'MatchExpression': {
        const match = node as AST.MatchExpression;
        const optSubj = this.optimizeNode(match.subject);
        return {
          ...match,
          subject: optSubj || match.subject,
          arms: match.arms.map(arm => ({
            pattern: arm.pattern,
            guard: arm.guard ? (this.optimizeNode(arm.guard) || arm.guard) : undefined,
            body: this.optimizeNode(arm.body) || arm.body,
          })),
        };
      }

      case 'CallExpression': {
        const call = node as AST.CallExpression;
        return {
          ...call,
          args: call.args.map(arg => this.optimizeNode(arg) || arg),
        };
      }

      case 'ArrayExpression': {
        const arr = node as AST.ArrayExpression;
        return {
          ...arr,
          elements: arr.elements.map(el => this.optimizeNode(el) || el),
        };
      }

      case 'IndexExpression': {
        const idx = node as AST.IndexExpression;
        const optObj = this.optimizeNode(idx.object);
        const optIdx = this.optimizeNode(idx.index);
        return {
          ...idx,
          object: optObj || idx.object,
          index: optIdx || idx.index,
        };
      }

      case 'ReferenceExpression': {
        const ref = node as AST.ReferenceExpression;
        const optArg = this.optimizeNode(ref.argument);
        return {
          ...ref,
          argument: optArg || ref.argument,
        };
      }

      case 'DereferenceExpression': {
        const deref = node as AST.DereferenceExpression;
        const optArg = this.optimizeNode(deref.argument);
        return {
          ...deref,
          argument: optArg || deref.argument,
        };
      }

      default:
        return node;
    }
  }

  private getNumericOrBoolValue(lit: AST.Literal): any {
    if (typeof lit.value === 'boolean') {
      return lit.value;
    }
    const str = String(lit.value);
    try {
      const parsed = parseLiteral(str);
      return parsed.value;
    } catch {
      const num = Number(str);
      return isNaN(num) ? null : num;
    }
  }
}
