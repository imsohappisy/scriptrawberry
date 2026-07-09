<p align="right">
  <a href="./README.md">한국어</a> | <strong>English</strong>
</p>

# ScriptRowberry

<p align="center">
  <img src="logo.png" alt="ScriptRowberry Logo" width="200"/>
</p>

**ScriptRowberry** is an ultra-fast, standalone compiler core and programming language designed to instantly compile text source code directly into native WebAssembly (.wasm) within browsers and any JavaScript environment.[cite: 1]

## Why ScriptRowberry?[cite: 1]

- **Extreme Speed**: Compiles source code strings into binaries in just tens of milliseconds (ms) without external toolchains (Rust, LLVM, Emscripten) or bloated runtimes, executing at the browser's native speed.[cite: 1]
- **Zero-Overhead FFI**: Leverages Wasm linear memory to communicate directly with the browser host environment (JS) using Fat Pointers, eliminating heavy scanning operations.[cite: 1]
- **Standalone Web Compiler**: With just a single `index.html` and the core library file, you can write, compile, and run code instantly inside the browser, even without an internet connection.[cite: 1]
- **Official Extension**: ScriptRowberry source code uses the `.scrb` extension (e.g., `main.scrb`).[cite: 1]

---

## Syntax Reference[cite: 1]

ScriptRowberry features a modern and intuitive syntax inspired by Rust, while targeting extreme C-level performance optimizations by default.[cite: 1]

### 1. Variable Declarations and Basic Types[cite: 1]
Variables are declared using the `let` keyword. Aligned with ScriptRowberry's primary focus, integer types are supported with the highest priority.[cite: 1]

```rust
let age: u32 = 25;       // Unsigned 32-bit integer
let count: i32 = -10;    // Signed 32-bit integer
let status: u8 = 1;      // 1-byte integer (for future bit-level optimization)
let x = 100;             // Type inference (defaults to i32)
```

### 2. Functions



Functions are defined using the `fn` keyword. If there is no return type, it can be omitted (or treated as `void`). When a return value is present, use `:` instead of `->` to specify the type. The top-level entry point is the `main` function.

```rust
fn add(a: u32, b: u32): u32 {
  return a + b;
}

fn main(): u32 {
  let result = add(10, 20);
  return result;
}
```

### 3. Control Flow



`if-else` blocks, `while` loops, `match` pattern matching, and `for` loops are fully supported.

```rust
// Conditionals
if count < 10 {
  // ...
} else {
  if count == 10 {
    // ...
  }
}

// Loops (Supports loop unrolling optimization)
let i: u32 = 0;
while i < 5 {
  i = i + 1;
}

// Match Statements
let val: u32 = 2;
match val {
  1 => { /* when val is 1 */ },
  2 => { /* when val is 2 */ },
  _ => { /* default case */ }
}
```

### 4. Structs



You can define structures that are allocated contiguously in memory.

```rust
struct Point {
  x: u32,
  y: u32,
}

fn main(): u32 {
  let p = Point { x: 10, y: 20 };
  return p.x;
}
```

### 5. Arrays and Fixed-Size Memory



Supports arrays statically allocated on the stack. Declared in the format `[type; size]`.

```rust
fn main(): u32 {
  let arr: [u32; 3] = [10, 20, 30];
  let first = arr[0];
  return 0;
}
```

### 6. Pointers and Memory References



Supports the reference (`&`) and dereference (`*`) operators to directly access memory addresses. Use mutable references (`&mut`) when a value needs to be modified.

```rust
fn increment(val: &mut u32) {
  *val = *val + 1;
}

fn main(): u32 {
  let x: u32 = 5;
  increment(&mut x);
  // x is now 6
  return 0;
}
```

### 7. Foreign Function Interface (FFI)



You can import and use functions provided by host environments like JavaScript. These are declared inside an `extern` block.

```rust
extern "env" {
  fn fillRect(x: u32, y: u32, w: u32, h: u32, color: &str);
  fn random(): u32;
}

fn main(): u32 {
  // Call JavaScript functions directly!
  let r = random();
  fillRect(0, 0, 100, 100, "#FF0000");
  return 0;
}
```

### 8. Strings (Fat Pointer Strings)



ScriptRowberry discards C-style null-terminated string scanning—a major culprit behind performance degradation—and adopts Fat Pointers (`&str`), which bundle the `address` and `length` into 8 bytes. As a result, passing strings to the JS host incurs zero scanning overhead ($O(1)$ time complexity).

```rust
extern "env" {
  fn print(s: &str);
}

fn main(): u32 {
  // The "Hello" string data is stored in Wasm memory, 
  // and its pointer and length are instantly passed to the print function as a struct.
  print("Hello"); 
  return 0;
}
```

---

## Access Playground



See for yourself how fast ScriptRowberry compiles to Wasm and renders onto the canvas right inside your browser.

* [Open Local Playground (Relative Link)](./index.html)
* [Try the Web Playground (GitHub Pages)](https://imsohappisy.github.io/scriptrawberry/)


## Detailed Specification Document



For detailed language specifications, tokenizing rules, and more, please refer to the manual.

* [Language Manual](./manual.html)
