import { Parser } from './parser';
import { Checker } from './checker';
import { CodeGenerator } from './codegen';
import { ASTOptimizer } from './optimizer';

// Dynamically import wabt to support both browser and Node.js environments if possible.
// Wait, if we use a bundler like esbuild, it can bundle 'wabt' perfectly.
import wabt from 'wabt';

export async function compileToWasm(code: string): Promise<Uint8Array> {
  // 1. Parsing
  const parser = new Parser(code);
  let ast = parser.parse();

  // 1.5. Optimize
  const optimizer = new ASTOptimizer();
  ast = optimizer.optimize(ast);

  // 2. Checking
  const checker = new Checker();
  checker.check(ast);

  // 3. WAT Generation
  const codegen = new CodeGenerator(ast, checker);
  const wat = codegen.generate();

  // 4. Assemble to WASM Bytecode (Directly in memory)
  const wabtModule = await wabt();
  const wasmModule = wabtModule.parseWat('inline.wat', wat);
  
  // Resolve imports/exports and compile to binary
  const { buffer } = wasmModule.toBinary({});
  
  return buffer;
}

export function compileToWat(code: string): string {
  const parser = new Parser(code);
  let ast = parser.parse();
  const optimizer = new ASTOptimizer();
  ast = optimizer.optimize(ast);
  const checker = new Checker();
  checker.check(ast);
  const codegen = new CodeGenerator(ast, checker);
  return codegen.generate();
}
