import * as AST from './ast';
import { Checker, StructLayout, EnumLayout } from './checker';
import { parseLiteral } from './literals';

export class CodeGenerator {
  private locals = new Map<string, number>();
  private localTypes = new Map<string, AST.TypeNode>();
  private localIndex = 0;
  private output: string[] = [];
  private structRegistry: Map<string, StructLayout>;
  private enumRegistry: Map<string, EnumLayout>;
  private constMap = new Map<string, AST.ASTNode>();
  private memoryLocals = new Map<string, { size: number, ptrLocal: string }>();
  private addressTakenVars = new Set<string>();
  private blockDepth = 0;
  private stackPtrUsed = false;
  private labelCounter = 0;
  
  private stringPool = new Map<string, number>();
  private stringDataOffset = 16; // Start data section at offset 16

  constructor(private program: AST.Program, private checker: Checker) {
    this.structRegistry = checker.getStructRegistry();
    this.enumRegistry = checker.getEnumRegistry();
    this.addressTakenVars = checker.getAddressTakenVars();
    // Build const map for inlining
    for (const [name, entry] of checker.getConstRegistry()) {
      this.constMap.set(name, entry.value);
    }
  }

  private getStringOffset(value: string): number {
    if (this.stringPool.has(value)) {
      return this.stringPool.get(value)!;
    }
    const offset = this.stringDataOffset;
    this.stringPool.set(value, offset);
    // Simple byte length calculation (assuming ASCII/UTF-8 single-byte for now)
    this.stringDataOffset += new TextEncoder().encode(value).length;
    return offset;
  }

  public generate(): string {
    this.output.push('(module');

    // Pass for external functions (MUST be before memory and global declarations)
    for (const node of this.program.body) {
      if (node.type === 'ExternDeclaration') {
        const ext = node as AST.ExternDeclaration;
        for (const fn of ext.functions) {
          const params = fn.params.map(p => p.paramType.name === '&str' ? 'i32 i32' : 'i32').join(' ');
          const res = fn.returnType.name === 'void' ? '' : ' (result i32)';
          const paramStr = params.length > 0 ? ` (param ${params})` : '';
          this.output.push(`  (import "${ext.namespace}" "${fn.name.name}" (func $${fn.name.name}${paramStr}${res}))`);
        }
      }
    }

    // First pass: collect string literals and check if we need linear memory
    this.stackPtrUsed = this.needsLinearMemory();
    if (this.stackPtrUsed || this.stringPool.size > 0) {
      this.output.push('  (memory (export "memory") 1)');
      this.output.push('  (global $__stack_ptr (mut i32) (i32.const 1024))');
      this.output.push('  (global $__ffi_scratch (mut i32) (i32.const 0))');
    }

    for (const node of this.program.body) {
      if (node.type === 'FunctionDeclaration') {
        this.generateFunction(node as AST.FunctionDeclaration);
      }
    }
    
    // Generate data section for strings
    for (const [str, offset] of this.stringPool.entries()) {
      // Escape string for Wasm WAT format
      const escaped = Array.from(new TextEncoder().encode(str))
        .map(b => '\\' + b.toString(16).padStart(2, '0'))
        .join('');
      this.output.push(`  (data (i32.const ${offset}) "${escaped}")`);
    }

    this.output.push(')');
    return this.output.join('\n');
  }

  private needsLinearMemory(): boolean {
    // Check if any function uses structs, arrays, or takes variable addresses
    if (this.addressTakenVars.size > 0) return true;
    for (const node of this.program.body) {
      if (node.type === 'FunctionDeclaration') {
        if (this.blockUsesMemory((node as AST.FunctionDeclaration).body)) return true;
      }
    }
    return false;
  }

  private blockUsesMemory(block: AST.BlockStatement): boolean {
    for (const stmt of block.body) {
      if (stmt.type === 'VariableDeclaration') {
        const decl = stmt as AST.VariableDeclaration;
        if (decl.varType?.isStruct || decl.varType?.isArray) return true;
        if (decl.varType && this.structRegistry.has(decl.varType.name)) return true;
      }
    }
    return false;
  }

  private generateFunction(fn: AST.FunctionDeclaration) {
    this.locals.clear();
    this.localTypes.clear();
    this.memoryLocals.clear();
    this.localIndex = 0;

    let paramString = '';
    for (const param of fn.params) {
      const pName = param.name.name;
      this.locals.set(pName, this.localIndex++);
      this.localTypes.set(pName, param.paramType);
      paramString += ` (param $${pName} i32)`;
    }

    let resultString = '';
    if (fn.returnType.name !== 'void') {
      resultString = ' (result i32)';
    }

    this.output.push(`  (func $${fn.name.name} (export "${fn.name.name}")${paramString}${resultString}`);
    
    // Pre-declare all locals
    this.declareLocals(fn.body);

    // Allocate space on stack if there are memory locals
    let totalStackFrameSize = 0;
    for (const mem of this.memoryLocals.values()) {
      totalStackFrameSize += mem.size;
    }
    
    if (totalStackFrameSize > 0) {
      this.output.push(`    ;; Allocate ${totalStackFrameSize} bytes on stack`);
      this.output.push(`    global.get $__stack_ptr`);
      this.output.push(`    i32.const ${totalStackFrameSize}`);
      this.output.push(`    i32.sub`);
      this.output.push(`    global.set $__stack_ptr`);
      
      // Assign stack addresses to memory locals
      let offset = 0;
      for (const [name, mem] of this.memoryLocals.entries()) {
        this.output.push(`    global.get $__stack_ptr`);
        if (offset > 0) {
          this.output.push(`    i32.const ${offset}`);
          this.output.push(`    i32.add`);
        }
        this.output.push(`    local.set $${mem.ptrLocal}`);
        offset += mem.size;
      }
    }

    // Generate function body
    for (const stmt of fn.body.body) {
      this.generateStatement(stmt);
    }

    this.output.push(`  )`);
  }

  private declareLocals(block: AST.BlockStatement) {
    for (const stmt of block.body) {
      if (stmt.type === 'VariableDeclaration') {
        const decl = stmt as AST.VariableDeclaration;
        const vName = decl.name.name;
        
        let varType = decl.varType || { name: 'i32', bitWidth: 32 };
        
        let memorySize = 0;
        if (varType.isStruct) {
          const layout = this.structRegistry.get(varType.name);
          if (layout) memorySize = layout.paddedBytes;
        } else if (varType.isArray && varType.arraySize) {
          memorySize = varType.arraySize * 4; 
        } else if (this.addressTakenVars.has(vName)) {
          memorySize = 4;
        }

        if (memorySize > 0) {
          const ptrLocal = `${vName}__ptr`;
          this.locals.set(ptrLocal, this.localIndex++);
          this.output.push(`    (local $${ptrLocal} i32)`);
          this.memoryLocals.set(vName, { size: memorySize, ptrLocal });
          this.localTypes.set(vName, varType);
          continue;
        }

        this.locals.set(vName, this.localIndex++);
        this.localTypes.set(vName, varType);
        this.output.push(`    (local $${vName} i32)`);
      }
      if (stmt.type === 'IfStatement') {
        const ifStmt = stmt as AST.IfStatement;
        this.declareLocals(ifStmt.consequent);
        if (ifStmt.alternate?.type === 'BlockStatement') {
          this.declareLocals(ifStmt.alternate as AST.BlockStatement);
        }
      }
      if (stmt.type === 'WhileStatement') {
        this.declareLocals((stmt as AST.WhileStatement).body);
      }
      if (stmt.type === 'ForStatement') {
        const forStmt = stmt as AST.ForStatement;
        if (!this.locals.has(forStmt.iterator.name)) {
          this.locals.set(forStmt.iterator.name, this.localIndex++);
          this.localTypes.set(forStmt.iterator.name, { name: 'i32', bitWidth: 32 });
          this.output.push(`    (local $${forStmt.iterator.name} i32)`);
        }
        this.declareLocals(forStmt.body);
      }
    }
  }

  private generateStatement(stmt: AST.ASTNode) {
    switch (stmt.type) {
      case 'VariableDeclaration': {
        const decl = stmt as AST.VariableDeclaration;
        if (decl.init) {
          if (decl.init.type === 'StructInstantiation') {
            const mem = this.memoryLocals.get(decl.name.name);
            if (mem) {
              this.generateStructInstantiation(decl.init as AST.StructInstantiation, mem.ptrLocal);
            }
          } else if (decl.init.type === 'ArrayExpression') {
            const mem = this.memoryLocals.get(decl.name.name);
            if (mem) {
              const arr = decl.init as AST.ArrayExpression;
              for (let i = 0; i < arr.elements.length; i++) {
                this.output.push(`    local.get $${mem.ptrLocal}`);
                if (i > 0) {
                  this.output.push(`    i32.const ${i * 4}`);
                  this.output.push(`    i32.add`);
                }
                this.generateExpression(arr.elements[i]);
                this.output.push(`    i32.store`);
              }
            }
          } else if (decl.init.type === 'StringLiteral') {
            const mem = this.memoryLocals.get(decl.name.name);
            if (mem) {
              const lit = decl.init as AST.StringLiteral;
              const offset = this.getStringOffset(lit.value);
              const length = new TextEncoder().encode(lit.value).length;
              this.output.push(`    local.get $${mem.ptrLocal}`);
              this.output.push(`    i32.const ${offset}`);
              this.output.push(`    i32.store`);
              this.output.push(`    local.get $${mem.ptrLocal}`);
              this.output.push(`    i32.const 4`);
              this.output.push(`    i32.add`);
              this.output.push(`    i32.const ${length}`);
              this.output.push(`    i32.store`);
            }
          } else {
            const mem = this.memoryLocals.get(decl.name.name);
            if (mem) {
              this.output.push(`    local.get $${mem.ptrLocal}`);
              this.generateExpression(decl.init);
              this.output.push(`    i32.store`);
            } else {
              this.generateExpression(decl.init);
              this.output.push(`    local.set $${decl.name.name}`);
            }
          }
        }
        break;
      }
      case 'ReturnStatement': {
        const ret = stmt as AST.ReturnStatement;
        if (ret.argument) {
          this.generateExpression(ret.argument);
          this.output.push(`    return`);
        }
        break;
      }
      case 'IfStatement': {
        this.generateIfStatement(stmt as AST.IfStatement);
        break;
      }
      case 'WhileStatement': {
        this.generateWhileStatement(stmt as AST.WhileStatement);
        break;
      }
      case 'ForStatement': {
        this.generateForUnrolled(stmt as AST.ForStatement);
        break;
      }
      case 'AssignmentExpression': {
        const assign = stmt as AST.AssignmentExpression;
        if (assign.target.type === 'Identifier') {
          const id = assign.target as AST.Identifier;
          const mem = this.memoryLocals.get(id.name);
          if (mem) {
            this.output.push(`    local.get $${mem.ptrLocal}`);
            this.generateExpression(assign.value);
            this.output.push(`    i32.store`);
          } else {
            this.generateExpression(assign.value);
            this.output.push(`    local.set $${id.name}`);
          }
        } else if (assign.target.type === 'MemberExpression') {
          const member = assign.target as AST.MemberExpression;
          this.generateLValue(member);
          this.generateExpression(assign.value);
          this.output.push(`    i32.store`);
        } else if (assign.target.type === 'IndexExpression') {
          const indexExpr = assign.target as AST.IndexExpression;
          this.generateLValue(indexExpr);
          this.generateExpression(assign.value);
          this.output.push(`    i32.store`);
        } else if (assign.target.type === 'DereferenceExpression') {
          const derefExpr = assign.target as AST.DereferenceExpression;
          this.generateExpression(derefExpr.argument); 
          this.generateExpression(assign.value);
          this.output.push(`    i32.store`);
        }
        break;
      }
      case 'MatchExpression': {
        this.generateMatchExpression(stmt as AST.MatchExpression);
        break;
      }
      case 'ConstDeclaration':
        break;
      default: {
        this.generateExpression(stmt);
        if (stmt.type === 'CallExpression') {
          const call = stmt as AST.CallExpression;
          const sig = this.checker.getFuncRegistry().get(call.callee.name);
          if (sig && sig.returnType.name !== 'void') {
            this.output.push(`    drop`);
          }
        } else {
          this.output.push(`    drop`);
        }
        break;
      }
    }
  }

  // --- Struct support ---

  private generateStructInstantiation(inst: AST.StructInstantiation, ptrLocal: string) {
    const layout = this.structRegistry.get(inst.structName.name);
    if (!layout) return;

    // Store each field value at its byte offset
    for (const fieldInit of inst.fields) {
      const fieldLayout = layout.fields.find(f => f.name === fieldInit.name.name);
      if (!fieldLayout) continue;
      const byteOffset = Math.floor(fieldLayout.bitOffset / 8);

      this.output.push(`    ;; store field '${fieldInit.name.name}' at offset ${byteOffset}`);
      this.output.push(`    local.get $${ptrLocal}`);
      this.generateExpression(fieldInit.value);
      if (fieldLayout.type.bitWidth && fieldLayout.type.bitWidth < 32) {
        const mask = (2 ** fieldLayout.type.bitWidth) - 1;
        this.output.push(`    i32.const ${mask}`);
        this.output.push(`    i32.and`);
      }
      this.output.push(`    i32.store offset=${byteOffset}`);
    }
  }

  private generateLValue(node: AST.ASTNode) {
    if (node.type === 'Identifier') {
      const id = node as AST.Identifier;
      const mem = this.memoryLocals.get(id.name);
      if (!mem) { console.log("MemoryLocals at crash:", this.memoryLocals, "\nFor:", id.name); throw new Error(`Cannot take address of non-memory variable ${id.name}`); }
      this.output.push(`    local.get $${mem.ptrLocal}`);
    } else if (node.type === 'MemberExpression') {
      const member = node as AST.MemberExpression;
      this.generateLValue(member.object); // address of the struct
      
      let objType: AST.TypeNode | undefined;
      if (member.object.type === 'Identifier') {
        objType = this.localTypes.get((member.object as AST.Identifier).name);
      }
      if (!objType || !objType.isStruct) throw new Error('Member access on non-struct');
      
      const layout = this.structRegistry.get(objType.name);
      if (!layout) throw new Error('Unknown struct');
      const fieldLayout = layout.fields.find(f => f.name === member.property.name);
      if (!fieldLayout) throw new Error('Unknown field');
      
      const byteOffset = Math.floor(fieldLayout.bitOffset / 8);
      if (byteOffset > 0) {
        this.output.push(`    i32.const ${byteOffset}`);
        this.output.push(`    i32.add`);
      }
    } else if (node.type === 'IndexExpression') {
      const idxExpr = node as AST.IndexExpression;
      this.generateLValue(idxExpr.object); // address of the array
      this.generateExpression(idxExpr.index); // index
      this.output.push(`    i32.const 4`); // element size is 4 bytes
      this.output.push(`    i32.mul`);
      this.output.push(`    i32.add`); // address + index * 4
    } else if (node.type === 'DereferenceExpression') {
      const derefExpr = node as AST.DereferenceExpression;
      this.generateExpression(derefExpr.argument); // Evaluates pointer to get address
    } else {
      throw new Error(`Invalid LValue: ${node.type}`);
    }
  }

  // --- Control Flow ---

  private generateIfStatement(ifStmt: AST.IfStatement) {
    this.generateExpression(ifStmt.condition);
    if (ifStmt.alternate) {
      this.output.push(`    if`);
    } else {
      this.output.push(`    if`);
    }
    for (const stmt of ifStmt.consequent.body) {
      this.generateStatement(stmt);
    }
    if (ifStmt.alternate) {
      this.output.push(`    else`);
      if (ifStmt.alternate.type === 'BlockStatement') {
        for (const stmt of (ifStmt.alternate as AST.BlockStatement).body) {
          this.generateStatement(stmt);
        }
      } else if (ifStmt.alternate.type === 'IfStatement') {
        this.generateIfStatement(ifStmt.alternate as AST.IfStatement);
      }
    }
    this.output.push(`    end`);
  }

  /**
   * Generates match expression as nested if/else blocks.
   * Each arm compares the subject's tag value against the variant index.
   * Wildcard (_) becomes the final else block.
   */
  private generateMatchExpression(matchExpr: AST.MatchExpression) {
    this.output.push(`    ;; === MATCH ===`);
    // We need a local to hold the subject value (tag)
    const matchLocal = `__match_subj_${this.labelCounter++}`;
    // The subject should already be on the stack; we store it in a temp
    // For simplicity: re-generate expression for each comparison
    
    const arms = matchExpr.arms;
    const nonWildcardArms = arms.filter(a => a.pattern.kind !== 'wildcard');
    const wildcardArm = arms.find(a => a.pattern.kind === 'wildcard');

    for (let i = 0; i < nonWildcardArms.length; i++) {
      const arm = nonWildcardArms[i];
      
      // Generate condition
      this.generateExpression(matchExpr.subject);
      
      if (arm.pattern.kind === 'variant') {
        // Find the enum and variant index
        const enumLayout = this.enumRegistry.get(arm.pattern.enumName || '');
        if (enumLayout) {
          const variant = enumLayout.variants.find(v => v.name === arm.pattern.variantName);
          if (variant) {
            this.output.push(`    i32.const ${variant.index}`);
            this.output.push(`    i32.eq`);
          }
        }
      } else if (arm.pattern.kind === 'literal') {
        const parsed = parseLiteral(arm.pattern.literalValue || '0');
        this.output.push(`    i32.const ${parsed.value}`);
        this.output.push(`    i32.eq`);
      }

      // Guard
      if (arm.guard) {
        this.generateExpression(arm.guard);
        this.output.push(`    i32.and`);
      }

      this.output.push(`    if`);
      
      // Body
      if (arm.body.type === 'BlockStatement') {
        for (const stmt of (arm.body as AST.BlockStatement).body) {
          this.generateStatement(stmt);
        }
      } else {
        this.generateExpression(arm.body);
        this.output.push(`    drop`);
      }

      // Start else chain
      if (i < nonWildcardArms.length - 1 || wildcardArm) {
        this.output.push(`    else`);
      }
    }

    // Wildcard arm (default)
    if (wildcardArm) {
      if (wildcardArm.body.type === 'BlockStatement') {
        for (const stmt of (wildcardArm.body as AST.BlockStatement).body) {
          this.generateStatement(stmt);
        }
      } else {
        this.generateExpression(wildcardArm.body);
        this.output.push(`    drop`);
      }
    }

    // Close all if/else blocks
    for (let i = 0; i < nonWildcardArms.length; i++) {
      this.output.push(`    end`);
    }
    this.output.push(`    ;; === END MATCH ===`);
  }

  private generateWhileStatement(whileStmt: AST.WhileStatement) {
    const blockLabel = `$while_block_${this.labelCounter}`;
    const loopLabel = `$while_loop_${this.labelCounter}`;
    this.labelCounter++;

    this.output.push(`    block ${blockLabel}`);
    this.output.push(`    loop ${loopLabel}`);
    // Condition check: if NOT condition, break
    this.generateExpression(whileStmt.condition);
    this.output.push(`    i32.eqz`);
    this.output.push(`    br_if ${blockLabel}`);
    // Body
    for (const stmt of whileStmt.body.body) {
      this.generateStatement(stmt);
    }
    // Continue loop
    this.output.push(`    br ${loopLabel}`);
    this.output.push(`    end`);
    this.output.push(`    end`);
  }

  /**
   * AST-level loop unrolling: for i in START..END { body }
   * Completely expands the loop at compile time — zero runtime branch cost.
   */
  private generateForUnrolled(forStmt: AST.ForStatement) {
    const startVal = this.evaluateConstant(forStmt.start);
    const endVal = this.evaluateConstant(forStmt.end);

    if (startVal === null || endVal === null) {
      throw new Error('for loop range must be compile-time constants (required for loop unrolling)');
    }

    this.output.push(`    ;; === UNROLLED for ${forStmt.iterator.name} in ${startVal}..${endVal} ===`);
    for (let i = startVal; i < endVal; i++) {
      this.output.push(`    ;; --- iteration ${forStmt.iterator.name} = ${i} ---`);
      // Set iterator value
      this.output.push(`    i32.const ${i}`);
      this.output.push(`    local.set $${forStmt.iterator.name}`);
      // Emit body
      for (const stmt of forStmt.body.body) {
        this.generateStatement(stmt);
      }
    }
    this.output.push(`    ;; === END UNROLLED ===`);
  }

  private evaluateConstant(node: AST.ASTNode): number | null {
    if (node.type === 'Literal') {
      const lit = node as AST.Literal;
      const parsed = parseLiteral(String(lit.value));
      return parsed.value;
    }
    return null;
  }

  // --- Expressions ---

  private generateExpression(expr: AST.ASTNode) {
    switch (expr.type) {
      case 'Literal': {
        const lit = expr as AST.Literal;
        if (typeof lit.value === 'boolean') {
          this.output.push(`    i32.const ${lit.value ? 1 : 0}`);
          break;
        }
        const parsed = parseLiteral(String(lit.value));
        this.output.push(`    i32.const ${parsed.value}`);
        break;
      }
      case 'StringLiteral': {
        const lit = expr as AST.StringLiteral;
        const offset = this.getStringOffset(lit.value);
        const length = new TextEncoder().encode(lit.value).length;
        
        // Dynamically allocate 8-byte struct on the stack
        this.output.push(`    global.get $__stack_ptr`);
        this.output.push(`    i32.const 8`);
        this.output.push(`    i32.sub`);
        this.output.push(`    global.set $__stack_ptr`);
        
        // Store ptr
        this.output.push(`    global.get $__stack_ptr`);
        this.output.push(`    i32.const ${offset}`);
        this.output.push(`    i32.store`);
        
        // Store len
        this.output.push(`    global.get $__stack_ptr`);
        this.output.push(`    i32.const 4`);
        this.output.push(`    i32.add`);
        this.output.push(`    i32.const ${length}`);
        this.output.push(`    i32.store`);
        
        // Push the struct address as the result
        this.output.push(`    global.get $__stack_ptr`);
        break;
      }
      case 'Identifier': {
        const id = expr as AST.Identifier;
        // Inline const values at usage site
        const constExpr = this.constMap.get(id.name);
        if (constExpr) {
          this.generateExpression(constExpr);
        } else {
          const mem = this.memoryLocals.get(id.name);
          if (mem) {
            this.output.push(`    local.get $${mem.ptrLocal}`);
          } else {
            this.output.push(`    local.get $${id.name}`);
          }
        }
        break;
      }
      case 'BinaryExpression': {
        const bin = expr as AST.BinaryExpression;
        this.generateExpression(bin.left);
        this.generateExpression(bin.right);
        switch (bin.operator) {
          case '+': this.output.push(`    i32.add`); break;
          case '-': this.output.push(`    i32.sub`); break;
          case '*': this.output.push(`    i32.mul`); break;
          case '/': this.output.push(`    i32.div_u`); break;
          case '==': this.output.push(`    i32.eq`); break;
          case '!=': this.output.push(`    i32.ne`); break;
          case '<': this.output.push(`    i32.lt_u`); break;
          case '>': this.output.push(`    i32.gt_u`); break;
          case '<=': this.output.push(`    i32.le_u`); break;
          case '>=': this.output.push(`    i32.ge_u`); break;
          case '&': this.output.push(`    i32.and`); break;
          case '|': this.output.push(`    i32.or`); break;
        }
        break;
      }
      case 'MemberExpression': {
        this.generateLValue(expr);
        this.output.push(`    i32.load`);
        break;
      }
      case 'IndexExpression': {
        this.generateLValue(expr);
        this.output.push(`    i32.load`);
        break;
      }
      case 'ReferenceExpression': {
        const ref = expr as AST.ReferenceExpression;
        this.generateLValue(ref.argument); // leaves address on stack
        break;
      }
      case 'DereferenceExpression': {
        const deref = expr as AST.DereferenceExpression;
        this.generateExpression(deref.argument); // leaves address on stack
        this.output.push(`    i32.load`);
        break;
      }
      case 'CallExpression': {
        const call = expr as AST.CallExpression;
        const sig = this.checker.getFuncRegistry().get(call.callee.name);
        
        // Push arguments onto the stack
        for (let i = 0; i < call.args.length; i++) {
          const arg = call.args[i];
          this.generateExpression(arg);
          
          if (sig?.isExtern && sig.params[i].type.name === '&str') {
            // Unpack 8-byte &str struct pointer into ptr and len for FFI
            this.output.push(`    global.set $__ffi_scratch`);
            this.output.push(`    global.get $__ffi_scratch`);
            this.output.push(`    i32.load`);
            this.output.push(`    global.get $__ffi_scratch`);
            this.output.push(`    i32.load offset=4`);
          }
        }
        this.output.push(`    call $${call.callee.name}`);
        break;
      }
    }
  }

  private maskValue(typeNode?: AST.TypeNode) {
    if (!typeNode || !typeNode.bitWidth || typeNode.bitWidth === 32) return;
    if (typeNode.isStruct) return;
    const mask = (2 ** typeNode.bitWidth) - 1;
    this.output.push(`    i32.const ${mask}`);
    this.output.push(`    i32.and`);
  }
}
