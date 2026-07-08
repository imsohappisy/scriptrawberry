const esbuild = require('esbuild');

esbuild.build({
  entryPoints: ['src/api.ts'],
  bundle: true,
  outfile: 'dist/scriptrawberry.js',
  format: 'iife',
  globalName: 'ScriptRowberry',
  target: ['es2020'],
  platform: 'browser',
  external: ['fs', 'path', 'crypto', 'child_process', 'os'],
  define: {
    'process.env.NODE_ENV': '"production"'
  }
}).then(() => {
  console.log("Compiler core built successfully for the web!");
}).catch((e) => {
  console.error("Build failed:", e);
  process.exit(1);
});
