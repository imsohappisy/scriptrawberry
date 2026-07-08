import * as AST from './ast';

export class CheckerError extends Error {
  constructor(public code: string, message: string) {
    super(`[${code}] ${message}`);
    this.name = 'CheckerError';
  }
}

export interface StructLayout {
  name: string;
  fields: { name: string; type: AST.TypeNode; bitOffset: number }[];
  totalBits: number;
  paddedBytes: number; // 32-bit aligned byte size
}

export interface EnumLayout {
  name: string;
  variants: { name: string; index: number; fields?: AST.StructField[] }[];
  tagBits: number;  // minimum bits to represent all variants
}
export interface FuncSignature {
  name: string;
  params: { name: string; type: AST.TypeNode }[];
  returnType: AST.TypeNode;
  isExtern?: boolean;
}

export class Checker {
  private env = new Map<string, AST.TypeNode>();
  private structRegistry = new Map<string, StructLayout>();
  private enumRegistry = new Map<string, EnumLayout>();
  private constRegistry = new Map<string, { type: AST.TypeNode; value: AST.ASTNode }>();
  private funcRegistry = new Map<string, FuncSignature>();
  private addressTakenVars = new Set<string>();

  public getAddressTakenVars(): Set<string> {
    return this.addressTakenVars;
  }

  public getStructRegistry(): Map<string, StructLayout> {
    return this.structRegistry;
  }

  public getEnumRegistry(): Map<string, EnumLayout> {
    return this.enumRegistry;
  }

  public getConstRegistry(): Map<string, { type: AST.TypeNode; value: AST.ASTNode }> {
    return this.constRegistry;
  }

  public getFuncRegistry(): Map<string, FuncSignature> {
    return this.funcRegistry;
  }

  public check(program: AST.Program) {
    // Pre-register built-in types
    this.structRegistry.set('&str', {
      name: '&str',
      fields: [
        { name: 'ptr', type: { name: 'u32', bitWidth: 32 }, bitOffset: 0 },
        { name: 'len', type: { name: 'u32', bitWidth: 32 }, bitOffset: 32 },
      ],
      totalBits: 64,
      paddedBytes: 8,
    });

    // First pass: register all structs, enums, and function signatures
    for (const node of program.body) {
      if (node.type === 'StructDeclaration') {
        this.registerStruct(node as AST.StructDeclaration);
      }
      if (node.type === 'EnumDeclaration') {
        this.registerEnum(node as AST.EnumDeclaration);
      }
      if (node.type === 'FunctionDeclaration') {
        const fn = node as AST.FunctionDeclaration;
        this.funcRegistry.set(fn.name.name, {
          name: fn.name.name,
          params: fn.params.map(p => ({ name: p.name.name, type: p.paramType })),
          returnType: fn.returnType,
        });
      }
      if (node.type === 'ExternDeclaration') {
        const ext = node as AST.ExternDeclaration;
        for (const fn of ext.functions) {
          this.funcRegistry.set(fn.name.name, {
            name: fn.name.name,
            params: fn.params.map(p => ({ name: p.name.name, type: p.paramType })),
            returnType: fn.returnType,
            isExtern: true,
          });
        }
      }
    }
    // Second pass: check everything
    for (const node of program.body) {
      this.checkNode(node);
    }
  }

  private registerEnum(decl: AST.EnumDeclaration) {
    const name = decl.name.name;
    const variants = decl.variants.map((v, i) => ({
      name: v.name.name,
      index: i,
      fields: v.fields,
    }));
    const tagBits = Math.ceil(Math.log2(Math.max(variants.length, 2)));
    this.enumRegistry.set(name, { name, variants, tagBits });
  }

  private registerStruct(decl: AST.StructDeclaration) {
    const name = decl.name.name;
    let bitOffset = 0;
    const fields: StructLayout['fields'] = [];

    for (const field of decl.fields) {
      const fieldType = field.fieldType;
      const bits = this.getBitWidth(fieldType);
      fields.push({ name: field.name.name, type: fieldType, bitOffset });
      bitOffset += bits;
    }

    const totalBits = bitOffset;
    // Pad to 32-bit boundary
    const paddedBytes = Math.ceil(totalBits / 32) * 4;

    this.structRegistry.set(name, { name, fields, totalBits, paddedBytes });
  }

  private getBitWidth(type: AST.TypeNode): number {
    if (type.bitWidth) return type.bitWidth;
    if (type.name === 'bool') return 1;
    if (type.name === 'f32') return 32;
    // Check if it's a struct type
    const layout = this.structRegistry.get(type.name);
    if (layout) return layout.totalBits;
    return 32; // default i32
  }

  public checkNode(node: AST.ASTNode): AST.TypeNode | void {
    switch (node.type) {
      case 'StructDeclaration':
      case 'EnumDeclaration':
        // Already registered in first pass
        break;
      case 'ConstDeclaration': {
        const constDecl = node as AST.ConstDeclaration;
        const valueType = this.checkNode(constDecl.value) as AST.TypeNode;
        this.constRegistry.set(constDecl.name.name, { type: constDecl.constType, value: constDecl.value });
        this.env.set(constDecl.name.name, constDecl.constType);
        break;
      }
      case 'MatchExpression': {
        const matchExpr = node as AST.MatchExpression;
        const subjType = this.checkNode(matchExpr.subject) as AST.TypeNode;
        
        // Check exhaustiveness for enum types
        if (subjType) {
          const enumLayout = this.enumRegistry.get(subjType.name);
          if (enumLayout) {
            const coveredVariants = new Set<string>();
            let hasWildcard = false;
            for (const arm of matchExpr.arms) {
              if (arm.pattern.kind === 'wildcard') hasWildcard = true;
              if (arm.pattern.kind === 'variant' && arm.pattern.variantName) {
                coveredVariants.add(arm.pattern.variantName);
              }
            }
            if (!hasWildcard) {
              for (const variant of enumLayout.variants) {
                if (!coveredVariants.has(variant.name)) {
                  throw new CheckerError('E005', `NonExhaustiveMatch: Missing variant '${variant.name}' in match on '${subjType.name}'`);
                }
              }
            }
          }
        }
        
        // Check each arm body
        for (const arm of matchExpr.arms) {
          if (arm.guard) this.checkNode(arm.guard);
          this.checkNode(arm.body);
        }
        return subjType;
      }
      case 'FunctionDeclaration': {
        const fn = node as AST.FunctionDeclaration;
        const prevEnv = new Map(this.env);
        for (const param of fn.params) {
          this.env.set(param.name.name, param.paramType);
        }
        this.checkNode(fn.body);
        this.env = prevEnv; // restore scope
        break;
      }
      case 'BlockStatement': {
        const block = node as AST.BlockStatement;
        for (const stmt of block.body) {
          this.checkNode(stmt);
        }
        break;
      }
      case 'VariableDeclaration': {
        const decl = node as AST.VariableDeclaration;
        let initType: AST.TypeNode | undefined;
        
        if (decl.init) {
          initType = this.checkNode(decl.init) as AST.TypeNode;
        }

        if (decl.varType && initType) {
          // Allow unsuffixed literals (inferred as i32) to be assigned to any integer type.
          // This matches the spec: "접미사 없음 → 문맥에 따라 추론"
          const isUnsuffixedLiteral = decl.init?.type === 'Literal' && this.isPlainIntegerLiteral(decl.init as AST.Literal);
          const bothIntegers = this.isIntegerType(decl.varType) && this.isIntegerType(initType);
          
          if (decl.varType.name !== initType.name && !isUnsuffixedLiteral && !bothIntegers) {
            throw new CheckerError('E002', `ImplicitCast: Cannot implicitly cast ${initType.name} to ${decl.varType.name}`);
          }
        }
        
        const typeToSet = decl.varType || initType;
        if (typeToSet) {
          decl.varType = typeToSet; // Inject inferred type back to AST
          this.env.set(decl.name.name, typeToSet);
          
          if (decl.init?.type === 'Literal') {
            const lit = decl.init as AST.Literal;
            this.checkLiteralBounds(lit, typeToSet);
          }
        }
        break;
      }
      case 'IfStatement': {
        const ifStmt = node as AST.IfStatement;
        this.checkNode(ifStmt.condition);
        this.checkNode(ifStmt.consequent);
        if (ifStmt.alternate) {
          this.checkNode(ifStmt.alternate);
        }
        break;
      }
      case 'WhileStatement': {
        const whileStmt = node as AST.WhileStatement;
        this.checkNode(whileStmt.condition);
        this.checkNode(whileStmt.body);
        break;
      }
      case 'ForStatement': {
        const forStmt = node as AST.ForStatement;
        // Validate start and end are compile-time constants
        const startType = this.checkNode(forStmt.start) as AST.TypeNode;
        const endType = this.checkNode(forStmt.end) as AST.TypeNode;
        // Register iterator variable
        this.env.set(forStmt.iterator.name, startType || { name: 'i32', bitWidth: 32, isSigned: true });
        this.checkNode(forStmt.body);
        break;
      }
      case 'AssignmentExpression': {
        const assign = node as AST.AssignmentExpression;
        this.checkNode(assign.target);
        this.checkNode(assign.value);
        break;
      }
      case 'BinaryExpression': {
        const expr = node as AST.BinaryExpression;
        const leftType = this.checkNode(expr.left) as AST.TypeNode;
        const rightType = this.checkNode(expr.right) as AST.TypeNode;
        
        if (leftType && rightType && leftType.name !== rightType.name) {
          // Allow operations between compatible integer types (e.g. u32 and i32)
          const bothIntegers = this.isIntegerType(leftType) && this.isIntegerType(rightType);
          if (!bothIntegers) {
            throw new CheckerError('E002', `ImplicitCast: Cannot operate on different types ${leftType.name} and ${rightType.name}`);
          }
        }

        // Comparison operators return bool/u1
        if (['==', '!=', '<', '>', '<=', '>='].includes(expr.operator)) {
          return { name: 'bool', bitWidth: 1 };
        }
        return leftType;
      }
      case 'Literal': {
        const lit = node as AST.Literal;
        if (typeof lit.value === 'boolean') {
          return { name: 'bool', bitWidth: 1 };
        }
        const str = String(lit.value);
        if (str.includes('b') && !str.startsWith('0b') && !str.startsWith('0B')) {
          const parts = str.split('b');
          const width = parseInt(parts[1], 10);
          const typeNode: AST.TypeNode = { name: `u${width}`, bitWidth: width, isSigned: false };
          this.checkLiteralBounds(lit, typeNode);
          return typeNode;
        }
        return { name: 'i32', bitWidth: 32, isSigned: true };
      }
      case 'Identifier': {
        const id = node as AST.Identifier;
        const typeNode = this.env.get(id.name);
        if (!typeNode) {
          throw new Error(`Undefined variable: ${id.name}`);
        }
        return typeNode;
      }
      case 'StructInstantiation': {
        const inst = node as AST.StructInstantiation;
        const layout = this.structRegistry.get(inst.structName.name);
        if (!layout) {
          throw new Error(`Undefined struct: ${inst.structName.name}`);
        }
        for (const field of inst.fields) {
          this.checkNode(field.value);
        }
        return { name: inst.structName.name, isStruct: true };
      }
      case 'MemberExpression': {
        const member = node as AST.MemberExpression;
        const objType = this.checkNode(member.object) as AST.TypeNode;
        if (objType) {
          const layout = this.structRegistry.get(objType.name);
          if (layout) {
            const field = layout.fields.find(f => f.name === member.property.name);
            if (!field) {
              throw new Error(`Unknown field '${member.property.name}' on struct '${objType.name}'`);
            }
            return field.type;
          }
        }
        break;
      }
      case 'ReturnStatement': {
        const ret = node as AST.ReturnStatement;
        if (ret.argument) {
          return this.checkNode(ret.argument) as AST.TypeNode;
        }
        break;
      }
      case 'ArrayExpression': {
        const arr = node as AST.ArrayExpression;
        if (arr.elements.length === 0) {
          throw new Error('Empty array literals are not supported yet');
        }
        const firstType = this.checkNode(arr.elements[0]) as AST.TypeNode;
        for (let i = 1; i < arr.elements.length; i++) {
          const t = this.checkNode(arr.elements[i]) as AST.TypeNode;
          if (t.name !== firstType.name) {
            throw new Error(`Array element type mismatch: expected ${firstType.name}, got ${t.name}`);
          }
        }
        return {
          name: `[${firstType.name}; ${arr.elements.length}]`,
          isArray: true,
          arraySize: arr.elements.length,
          elementType: firstType,
        };
      }
      case 'IndexExpression': {
        const idxExpr = node as AST.IndexExpression;
        const objType = this.checkNode(idxExpr.object) as AST.TypeNode;
        if (!objType.isArray || !objType.elementType) {
          throw new Error(`Cannot index into non-array type ${objType.name}`);
        }
        const indexType = this.checkNode(idxExpr.index) as AST.TypeNode;
        if (!this.isIntegerType(indexType)) {
          throw new Error(`Array index must be an integer, got ${indexType.name}`);
        }
        return objType.elementType;
      }
      case 'ReferenceExpression': {
        const refExpr = node as AST.ReferenceExpression;
        const argType = this.checkNode(refExpr.argument) as AST.TypeNode;
        
        // Track address taken so Codegen can allocate it in linear memory
        if (refExpr.argument.type === 'Identifier') {
          const id = refExpr.argument as AST.Identifier;
          this.addressTakenVars.add(id.name);
        }
        
        return {
          name: refExpr.isMut ? `&mut ${argType.name}` : `&${argType.name}`,
          isPointer: true,
          isMut: refExpr.isMut,
          elementType: argType,
          bitWidth: 32, // Wasm memory pointers are 32-bit
        };
      }
      case 'DereferenceExpression': {
        const deref = node as AST.DereferenceExpression;
        const argType = this.checkNode(deref.argument) as AST.TypeNode;
        if (!argType.isPointer || !argType.elementType) {
          throw new Error(`Cannot dereference non-pointer type ${argType.name}`);
        }
        return argType.elementType;
      }
      case 'CallExpression': {
        const call = node as AST.CallExpression;
        const sig = this.funcRegistry.get(call.callee.name);
        if (!sig) {
          throw new CheckerError('E006', `UndefinedFunction: Function '${call.callee.name}' is not defined`);
        }
        if (call.args.length !== sig.params.length) {
          throw new CheckerError('E007', `ArgumentCount: Function '${call.callee.name}' expects ${sig.params.length} arguments, got ${call.args.length}`);
        }
        for (let i = 0; i < call.args.length; i++) {
          const argNode = call.args[i];
          const argType = this.checkNode(argNode) as AST.TypeNode;
          const paramType = sig.params[i].type;

          const isUnsuffixedLiteral = argNode.type === 'Literal' && this.isPlainIntegerLiteral(argNode as AST.Literal);
          const bothIntegers = this.isIntegerType(paramType) && this.isIntegerType(argType);

          if (argType.name !== paramType.name && !isUnsuffixedLiteral && !bothIntegers) {
            throw new CheckerError('E002', `ArgumentTypeMismatch: Expected ${paramType.name}, got ${argType.name} (from ${argNode.type})`);
          }

          if (argNode.type === 'Literal') {
            this.checkLiteralBounds(argNode as AST.Literal, paramType);
          }
        }
        return sig.returnType;
      }
      case 'StringLiteral': {
        return { name: '&str', isStruct: true, bitWidth: 64 };
      }
    }
  }

  private checkLiteralBounds(lit: AST.Literal, typeNode: AST.TypeNode) {
    if (!typeNode.bitWidth) return;
    let str = String(lit.value);
    // Handle bit suffix like 5b3
    if (str.includes('b') && !str.startsWith('0b') && !str.startsWith('0B')) {
      str = str.split('b')[0];
    }
    let value = 0;
    if (str.startsWith('0x') || str.startsWith('0X')) {
      value = parseInt(str, 16);
    } else if (str.startsWith('0b') || str.startsWith('0B')) {
      value = parseInt(str.slice(2), 2);
    } else {
      value = parseInt(str, 10);
    }

    if (typeNode.isSigned) {
      const min = -(2 ** (typeNode.bitWidth - 1));
      const max = (2 ** (typeNode.bitWidth - 1)) - 1;
      if (value < min || value > max) {
        throw new CheckerError('E001', `LiteralOverflow: Literal ${value} overflows ${typeNode.name} (min ${min}, max ${max})`);
      }
    } else {
      const max = (2 ** typeNode.bitWidth) - 1;
      if (value < 0 || value > max) {
        throw new CheckerError('E001', `LiteralOverflow: Literal ${value} overflows ${typeNode.name} (max ${max})`);
      }
    }
  }

  private isPlainIntegerLiteral(lit: AST.Literal): boolean {
    const str = String(lit.value);
    if (typeof lit.value === 'boolean') return false;
    if (str.includes('b') && !str.startsWith('0b') && !str.startsWith('0B')) return false;
    return true;
  }

  private isIntegerType(type: AST.TypeNode): boolean {
    if (type.isStruct) return false;
    if (type.name === 'bool') return false;
    if (type.name === 'f32') return false;
    return true;
  }
}
