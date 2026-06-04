import { Parser } from './parser';
import { Checker } from './checker';
import { CodeGenerator } from './codegen';

const code = `
  fn main(): u32 {
    let mut x: u32 = 10;
    let p = &mut x;
    return x;
  }
`;
const ast = new Parser(code).parse();
const checker = new Checker();
checker.check(ast);
console.log("Address taken vars:", Array.from(checker.getAddressTakenVars()));
const codegen = new CodeGenerator(ast, checker);
try {
  console.log(codegen.generate());
} catch(e) {
  console.error(e);
}
