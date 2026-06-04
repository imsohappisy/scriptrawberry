const fs = require('fs');
let content = fs.readFileSync('src/codegen.ts', 'utf8');
content = content.replace(
  'let memorySize = 0;',
  'console.log("declareLocals visiting:", vName, "addressTakenVars has:", this.addressTakenVars.has(vName)); let memorySize = 0;'
);
fs.writeFileSync('src/codegen.ts', content);
