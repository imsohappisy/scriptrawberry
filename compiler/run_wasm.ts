import * as fs from 'fs';
import * as path from 'path';

// @ts-ignore
const wabtPromise = import('wabt').then(m => m.default());

async function run() {
  const wabt = await wabtPromise;
  
  // Read WAT file
  const watPath = process.argv[2] || 'out.wat';
  const watContent = fs.readFileSync(watPath, 'utf8');

  // Compile WAT to Wasm binary
  const wasmModule = wabt.parseWat(watPath, watContent);
  const { buffer } = wasmModule.toBinary({});
  
  let wasmInstance: WebAssembly.Instance;

  // Set up the FFI environment
  const importObject = {
    env: {
      print: (ptr: number, len: number) => {
        // Read memory from the Wasm instance
        const memory = wasmInstance.exports.memory as WebAssembly.Memory;
        const bytes = new Uint8Array(memory.buffer, ptr, len);
        const text = new TextDecoder('utf-8').decode(bytes);
        console.log(`[Wasm FFI] ${text}`);
      }
    }
  };

  // Instantiate and run
  const result = await WebAssembly.instantiate(buffer, importObject) as any;
  wasmInstance = result.instance || result;
  
  const main = wasmInstance.exports.main as Function;
  if (main) {
    console.log(`Return value: ${main()}`);
  } else {
    console.log("No main function found.");
  }
}

run().catch(console.error);
