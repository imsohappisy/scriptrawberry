import * as fs from 'fs';
import { Parser } from './parser';
import { Checker } from './checker';
import { CodeGenerator } from './codegen';

import { ASTOptimizer } from './optimizer';

function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('Usage: srbc <input.srb> -o <output.wat>');
    process.exit(1);
  }

  const inputFile = args[0] as string;
  let outputFile = 'out.wat';
  
  if (args[1] === '-o' && args[2]) {
    outputFile = args[2];
  }

  try {
    const code = fs.readFileSync(inputFile, 'utf8');
    
    // 1. Parse
    const parser = new Parser(code);
    let ast = parser.parse();

    // 1.5. Optimize
    const optimizer = new ASTOptimizer();
    ast = optimizer.optimize(ast);

    // 2. Check
    const checker = new Checker();
    checker.check(ast);

    // 3. Generate Code
    const codegen = new CodeGenerator(ast, checker);
    const wat = codegen.generate();

    fs.writeFileSync(outputFile, wat);
    console.log(`Compiled successfully to ${outputFile}`);
  } catch (err: any) {
    console.error(`Compilation Error: ${err.message}`);
    process.exit(1);
  }
}

main();
