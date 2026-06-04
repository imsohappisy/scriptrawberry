const fs = require('fs');
const content = fs.readFileSync('src/codegen.ts', 'utf8');
const patched = content.replace(
  'if (!mem) throw new Error(`Cannot take address of non-memory variable ${id.name}`);',
  'if (!mem) { console.log("MemoryLocals at crash:", this.memoryLocals, "\\nFor:", id.name); throw new Error(`Cannot take address of non-memory variable ${id.name}`); }'
);
fs.writeFileSync('src/codegen.ts', patched);
