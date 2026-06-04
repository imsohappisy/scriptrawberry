const fs = require('fs');
let code = fs.readFileSync('src/checker.ts', 'utf8');
code = code.replace(
  "throw new CheckerError('E002', `ArgumentTypeMismatch: Expected ${sig.params[i].type.name}, got ${argType.name}`);",
  "throw new CheckerError('E002', `ArgumentTypeMismatch: Expected ${sig.params[i].type.name}, got ${argType.name} (from ${call.args[i].type})`);"
);
fs.writeFileSync('src/checker.ts', code);
