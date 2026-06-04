# ScriptRowberry Compiler 진행 상황
**주의 : 이전 내역을 지우지 않습니다**

## [Phase 1 완료] (2025-06-03)
- **목표**: MVP (기본 함수, 변수, uN 타입, 비트 연산) 구현 및 `.wat` 컴파일 증명
- **완료된 작업**:
  - `pnpm`을 활용한 TypeScript 기반 프로젝트 초기화 완료
  - `Lexer`: 커스텀 비트 리터럴 (`5b3`, `0xFF_u8`) 및 키워드 파싱 구현 완료
  - `Parser`: 재귀 하강(Recursive Descent) 파싱으로 핵심 문법 AST 생성 구현 완료
  - `Checker`: 의미 분석기를 통해 `E001` (리터럴 오버플로우), `E002` (암묵적 형변환 오류) 방어 구현 완료
  - `Codegen`: Wasm Text(`.wat`) 생성 시 `i32` 래핑 및 `i32.and` 비트 마스킹 주입 기능 구현 완료
  - `CLI`: `srbc` 형태의 터미널 파이프라인 통합 완료 및 테스트 통과

## [Phase 2 완료] (2025-06-03)
- **목표**: 구조체(`struct`), 제어 흐름(`if/else`, `while`, `for` 루프 전개), 선형 메모리(스택 할당) 구현
- **설계 결정**:
  - 메모리 할당: 로컬 스택 기반 정적 할당 (힙/GC 없음)
  - for 루프: AST 단계 완전 전개(Loop Unrolling) — 런타임 분기 비용 0
  - 포인터: u32 주소 직접 전달 (차용 검사 생략, load/store 직접 접근)
- **완료된 작업**:
  - `AST`: StructDeclaration, StructInstantiation, MemberExpression, AssignmentExpression 노드 추가
  - `Lexer`: `in`, `pub`, `static`, `&&`, `||` 토큰 추가
  - `Parser`: struct 선언/인스턴스화, if/else, while, for..in 범위 루프, 멤버 접근(`.`), 대입문 파싱 구현
  - `Checker`: 구조체 레지스트리 및 비트 단위 메모리 레이아웃 계산 (패딩 포함), 정수 타입 간 호환성 완화, 스코프 복원
  - `Codegen`: Wasm `(memory 1)` 선형 메모리, `$__stack_ptr` 전역 스택 포인터, 구조체 `i32.store`/`i32.load`, `if/else/end` 블록, `block/loop/br_if/br` while 루프, **for 루프 AST 완전 전개(Loop Unrolling)** 구현
  - `literals.ts`: `0b3` (값0, u3) vs `0b1010` (이진수) 파싱 모호성 해결을 위한 공유 유틸리티 작성
  - 버그 수정: `0b3` 리터럴이 `NaN`으로 파싱되던 문제 해결
  - 전체 16개 테스트 통과, `example_phase2.srb` → `example_phase2.wat` E2E 컴파일 성공

## [Phase 3 완료] (2025-06-04)
- **목표**: 열거형(`enum`), 패턴 매칭(`match`), `const` 상수, 어노테이션(`@export`, `@inline`, `@lut`) 구현
- **완료된 작업**:
  - `AST`: EnumDeclaration, EnumVariant, EnumVariantRef, MatchExpression, MatchArm, MatchPattern, ConstDeclaration, Annotation 인터페이스 추가
  - `Lexer`: `@annotation` 토큰 타입 추가, `::` 연산자 추가, `_` 와일드카드 키워드 추가
  - `Parser`: enum 선언 (데이터 운반 배리언트 포함), const 선언, match 표현식 (variant/wildcard/literal 패턴, guard 조건), `@annotation` 파싱 구현
  - `Checker`: enum 레지스트리 (배리언트 인덱스 자동 할당, tagBits 계산), const 레지스트리, **match 완전성 검사 (E005: NonExhaustiveMatch)** — 와일드카드(`_`)가 누락된 배리언트를 커버하는 것도 인식
  - `Codegen`: match → 중첩 `if/else/end` WAT 블록으로 컴파일, enum 태그 값(`i32.const N`) 비교, **const 인라이닝** (사용 위치에서 `local.get` 대신 값을 직접 삽입 — 런타임 오버헤드 0)
  - 전체 22개 테스트 통과, `example_phase3.srb` → `example_phase3.wat` E2E 컴파일 성공

## [함수 호출 구문 구현] (2025-06-04)
- **목표**: 함수 호출 표현식 (`fn_name(arg1, arg2, ...)`) 지원
- **완료된 작업**:
  - `AST`: `CallExpression` 노드 추가 (callee: Identifier, args: ASTNode[])
  - `Parser`: `identifier(` 패턴을 인식하여 인자를 쉼표로 분리 파싱, 호출 결과에 대한 멤버 접근(`.`) 체이닝 지원
  - `Checker`: 함수 시그니처 레지스트리 (`FuncSignature`) 추가 — 1차 패스에서 모든 함수 선언을 수집, 호출 시 **E006 (UndefinedFunction)** 및 **E007 (ArgumentCount)** 검증
  - `Codegen`: 인자를 Wasm 스택에 push한 후 `call $funcName` 명령어 생성, 중첩 호출(`add(square(a), square(b))`) 및 0인자 호출 지원
  - 전체 29개 테스트 통과, `example_call.srb` → `example_call.wat` E2E 컴파일 성공

## [Phase 4 완료] (2025-06-04)
- **목표**: 정적 배열(`[T; N]`) 및 포인터(`&`, `&mut`, `*`) 참조 연산자 구현 (스택 기반 선형 메모리 할당)
- **완료된 작업**:
  - `AST`: `ArrayExpression`, `IndexExpression`, `ReferenceExpression`, `DereferenceExpression` 노드 추가 및 `TypeNode` 확장 (`isArray`, `isPointer`, `isMut` 속성 추가)
  - `Parser`: `[T; N]`, `&T`, `&mut T` 타입 파싱, `[a, b, c]` 배열 리터럴, `&`, `*` 단항 연산자, `arr[i]` 인덱스 접근을 올바른 우선순위로 재귀 하강 파싱 (후위 연산자 루프 리팩토링)
  - `Checker`: 배열 인덱스 바운드(타입 레벨) 확인 및 인덱스의 정수 타입 여부 확인, 포인터 연산자 타입 매칭. `&`를 통해 주소가 취해지는 변수를 식별하고 `addressTakenVars` 맵에 기록하여 선형 메모리에 할당되도록 최적화.
  - `Codegen`: `$__stack_ptr` 전역 변수를 통한 Wasm 선형 메모리 할당을 구조체뿐만 아니라 배열과 주소가 취해진 기본 타입 변수까지 확장. 포인터 연산(곱셈과 덧셈)을 통한 `arr[i]` 배열 인덱싱 및 `*ptr` 역참조의 메모리 load/store 로직 구현.
  - 전체 테스트 통과 (4개의 신규 배열/포인터 테스트 추가), `example_phase4.srb` E2E 프로그램 정상 동작 확인.

## [Phase 5 완료] (2025-06-04)
- **목표**: 문자열(`&str`) 리터럴, **Fat Pointer** 설계 적용 및 Wasm FFI(`extern` block) 제로 카피 연동 구현
- **설계 결정**:
  - 문자열 표현: C-style null-terminated 스캔 방식 대신, 런타임 슬라이싱 및 호스트 연동 시 $O(1)$ 성능을 내는 **Fat Pointer (`{ ptr: u32, len: u32 }`, 8 bytes)** 방식을 채택.
  - FFI 연동: `extern` 함수 호출 시 8바이트 구조체 포인터에서 `ptr`과 `len`을 동적으로 Unpacking 하여 Wasm 스택에 두 개의 `i32` 값으로 직접 전달 (JS Host 연동 오버헤드 최소화).
- **완료된 작업**:
  - `AST` 및 `Lexer`: `extern` 키워드 추가 및 이스케이프 시퀀스가 포함된 `StringLiteral`(`"..."`) 노드 파싱 완료.
  - `Parser`: `extern "namespace" { ... }` 블록 및 `str` / `&str` 내장 타입 파싱 구현.
  - `Checker`: `ExternDeclaration` 함수들을 `funcRegistry`에 등록 시 `isExtern` 플래그 추가. `&str`을 8바이트 내장 구조체 레이아웃으로 사전 등록 및 `StringLiteral` 타입 검사 완비.
  - `Codegen`: 모듈 최상단에 Wasm `(import ...)` 구문 생성. 문자열 리터럴을 수집하여 연속적인 정적 오프셋을 갖는 `(data ...)` 섹션으로 컴파일. 런타임에 8바이트 Fat Pointer를 동적으로 할당하고 초기화하는 로직 구현.
  - FFI 호출 규약 최적화: Wasm 스택에서 추가 메모리 할당 없이 값을 조작하는 특수 로컬 `$__ffi_scratch`를 통해 Fat Pointer 언패킹 지원.
  - Node.js JS Host가 포함된 E2E 테스트 스크립트(`run_wasm.ts`)와 `example_phase5.srb`를 작성하여 `&str` 문자열이 `extern` FFI를 통해 정확하고 빠르게 전달됨을 증명 완료.
