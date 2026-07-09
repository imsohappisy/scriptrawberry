<p align="right">
  <strong>한국어</strong> | <a href="./README_EN.md">English</a>
</p>

# ScriptRowberry

<p align="center">
  <img src="logo.png" alt="ScriptRowberry Logo" width="200"/>
</p>

**ScriptRowberry**는 브라우저 및 모든 자바스크립트 환경에서 "텍스트 소스 코드를 네이티브 WebAssembly(.wasm)로 즉시 다이렉트 변환"하는 초고속 독립형 컴파일러 코어이자 프로그래밍 언어입니다.

## 왜 ScriptRowberry인가?

- **Extreme Speed**: 외부 툴체인(Rust, LLVM, Emscripten)이나 거대한 런타임 없이, 수십 밀리초(ms) 만에 소스 코드 문자열을 바이너리로 조립하여 브라우저의 네이티브 속도로 실행합니다.
- **제로 오버헤드 FFI**: Wasm 선형 메모리를 활용하여 브라우저 호스트 환경(JS)과 무거운 스캔 작업 없이 다이렉트로 통신(Fat Pointer)합니다.
- **임의 비트 정수형 (Custom-Width Integers)**: `u3`, `u7`, `i12` 같은 N비트 타입을 직접 선언할 수 있으며, 컴파일러가 자동으로 비트 마스킹을 주입하여 메모리 효율을 극대화합니다.
- **강력한 컴파일러 최적화**: 
  - **SROA (Scalar Replacement of Aggregates)**: 비탈출 로컬 구조체를 선형 메모리 대신 Wasm 로컬 레지스터로 분할 배치하여 메모리 I/O 오버헤드를 0으로 단축합니다.
  - **하이브리드 루프 최적화**: 16회 이하의 상수 루프는 자동으로 Loop Unrolling을 수행하고, 그 이상 또는 변수 범위 루프는 dynamic block/loop 구조로 동적 컴파일합니다.
  - **상수 접기 & 데드 코드 제거**: 컴파일 타임에 수식과 `const`를 전파 및 계산하고, 실행되지 않는 조건 분기(`if true/false`)를 AST 단계에서 완전히 제거합니다.
- **독립형 웹 컴파일러**: `index.html` 단 하나와 코어 라이브러리 파일만 있으면, 인터넷 연결이 끊어져도 브라우저 안에서 즉시 코딩하고 컴파일하여 실행할 수 있습니다.
- **공식 확장자**: ScriptRowberry의 소스 코드는 `.scrb` 확장자를 사용합니다. (예: `main.scrb`)

---

## 문법 가이드 (Syntax Reference)

ScriptRowberry는 Rust와 유사한 모던하고 직관적인 문법을 지향하며, C 언어 수준의 극단적인 성능 최적화를 기본으로 합니다.

### 1. 변수 선언과 기본 타입
`let` 키워드를 사용하여 변수를 선언합니다. ScriptRowberry의 핵심 목적에 따라, 정수형 타입들을 최우선으로 지원합니다.

```rust
let age: u32 = 25;       // 부호 없는 32비트 정수
let count: i32 = -10;    // 부호 있는 32비트 정수
let status: u1 = 1b1;    // 1비트 정수 플래그
let category: u3 = 5b3;  // 3비트 정수 (0~7)
let x = 100;             // 타입 추론 (기본 i32)
```

### 2. 함수 정의 (Functions)
`fn` 키워드로 함수를 정의합니다. 반환 타입이 없으면 생략하며, 반환값이 있는 경우 `:`를 사용하여 타입을 지정합니다. 최상위 진입점은 `main` 함수입니다.

```rust
fn add(a: u32, b: u32): u32 {
  return a + b;
}

fn main(): u32 {
  let result = add(10, 20);
  return result;
}
```

### 3. 제어문 (Control Flow)
`if-else` 블록과 `while` 반복문, `match` 패턴 매칭, `for` 루프를 완벽하게 지원합니다.

```rust
// 조건문
if count < 10 {
  // ...
} else {
  if count == 10 {
    // ...
  }
}

// 반복문 (Unrolling 및 Dynamic Loop 하이브리드 컴파일 지원)
for i in 0..5 {          // 16회 이하는 자동으로 루프 풀기(Unrolled)
  // ...
}

for i in 0..100 {        // 16회 초과는 Dynamic Loop로 Wasm 루프 생성
  // ...
}

// 매치 구문
let val: u32 = 2;
match val {
  1 => { /* val이 1일 때 */ },
  2 => { /* val이 2일 때 */ },
  _ => { /* 기본값 (default) */ }
}
```

### 4. 구조체 (Structs)
메모리 상에 연속적으로 배치되는 구조체를 정의할 수 있습니다. 

```rust
struct Point {
  x: u32,
  y: u32,
}

fn main(): u32 {
  // 주소가 참조되지 않는 구조체 변수는 SROA 최적화에 의해 스택 메모리가 아닌 레지스터에 바로 매핑됩니다.
  let p = Point { x: 10, y: 20 };
  return p.x;
}
```

### 5. 배열과 고정 크기 메모리 (Arrays)
스택에 정적으로 할당되는 배열을 지원합니다. `[타입; 크기]` 형태로 선언합니다.

```rust
fn main(): u32 {
  let arr: [u32; 3] = [10, 20, 30];
  let first = arr[0];
  return 0;
}
```

### 6. 포인터와 메모리 참조 (Pointers)
메모리 주소에 직접 접근하기 위한 참조(`&`) 연산자와 역참조(`*`) 연산자를 지원합니다. 값의 변경이 필요할 경우 가변 참조(`&mut`)를 사용합니다.

```rust
fn increment(val: &mut u32) {
  *val = *val + 1;
}

fn main(): u32 {
  let mut x: u32 = 5;
  increment(&mut x);
  // x는 이제 6
  return 0;
}
```

### 7. 외부 함수 호출 (FFI - Foreign Function Interface)
자바스크립트 등 호스트 환경에서 제공하는 함수를 가져와 사용할 수 있습니다. `extern` 블록 내부에 선언합니다.

```rust
extern "env" {
  fn fillRect(x: u32, y: u32, w: u32, h: u32, color: &str);
  fn random(): u32;
}

fn main(): u32 {
  // 자바스크립트 측의 함수를 곧바로 호출!
  let r = random();
  fillRect(0, 0, 100, 100, "#FF0000");
  return 0;
}
```

### 8. 문자열 (Fat Pointer Strings)
ScriptRowberry는 `주소`와 `길이`가 8바이트로 묶인 Fat Pointer(`&str`)를 채택하여, 문자열을 JS 호스트로 넘길 때 스캔 오버헤드가 단 1도 발생하지 않습니다(O(1) 시간복잡도).

```rust
extern "env" {
  fn print(s: &str);
}

fn main(): u32 {
  print("Hello"); 
  return 0;
}
```

---

## 컴파일러 파이프라인

```
.scrb 소스
  │
  ├── Lexer (비트 접미사, 16진/2진 리터럴 파싱)
  ├── Parser (AST 생성)
  ├── Checker (타입 검사, 소유권 분석)
  ├── ASTOptimizer (상수 접기, 데드 브랜치 제거, 상수 전파)
  └── CodeGenerator (Wasm WAT 생성)
       ├── SROA: 비탈출 구조체 → Wasm local 레지스터 변환
       ├── Hybrid Loop: ≤16 → Unroll / >16 or 변수 → block+loop
       └── Bit Masking: uN 타입 연산 후 자동 AND 마스크 주입
```

## 빌드 및 사용

```bash
cd compiler
pnpm install

# 테스트 실행
npx vitest run

# 브라우저 번들 생성
node build.js
# → dist/scriptrawberry.js 생성

# 브라우저 playground 실행
open index.html
```

## 프로젝트 구조

```
compiler/
  src/
    lexer.ts        — 렉서
    parser.ts       — 파서 & AST 생성
    checker.ts      — 타입 검사기
    optimizer.ts    — AST 최적화 패스 (상수 접기, DCE, SROA 사전처리)
    codegen.ts      — Wasm WAT 코드 생성기
    api.ts          — 브라우저용 compileToWasm() API
    tests/          — 테스트 파일 (vitest)
  examples/         — .srb 예제 코드 및 컴파일된 .wat 파일
  index.html        — 브라우저 인터랙티브 플레이그라운드
  build.js          — esbuild 번들 스크립트
scriptrowberry_spec_v2.html  — 규격 초안 명세서
manual.html        — 상세 스펙 브라우저 뷰어 페이지
index.html         — 메인 실험 페이지 및 웹 플레이그라운드
```

---

## Playground 접속
ScriptRowberry가 브라우저에서 얼마나 빠르게 Wasm으로 컴파일되고 캔버스를 그리는지 직접 눈으로 확인해 보세요.
- [로컬 플레이그라운드 파일 열기 (상대 경로)](./index.html)
- [Web Playground 체험하기 (GitHub Pages)](https://imsohappisy.github.io/scriptrawberry/)

## 상세 스펙 문서
자세한 언어 스펙과 토크나이징 룰 등은 설명서를 참고하세요.
- [Language Manual](./manual.html)

## 라이선스
MIT
