<p align="right">
  <a href="./CONTRIBUTING.md">한국어</a> | <strong>English</strong>
</p>

# ScriptRowberry Contributing Guidelines

Thank you for your interest in contributing to ScriptRowberry! ScriptRowberry is an open-source systems programming language designed for bit-level precision, targeting WebAssembly. We welcome and appreciate all forms of contributions.

## Before Contributing

1. Check the existing [Issues](https://github.com/imsohappisy/scriptrawberry/issues) to ensure the bug you found or the feature you want to propose isn't already being discussed.
2. If you find a new bug or have a feature proposal, please open a new issue first.

## Development Setup

The compiler core is located in the `compiler` directory.

```bash
# 1. Clone the repository and navigate to the compiler dir
git clone https://github.com/imsohappisy/scriptrawberry.git
cd scriptrawberry/compiler

# 2. Install dependencies (pnpm is recommended)
npx pnpm install

# 3. Build the core browser API bundle
node build.js
# This will update the dist/scriptrawberry.js bundle file on success.
```

## Writing Code and Testing

To maintain the stability of the compiler core, we thoroughly verify changes with unit tests.

*   **Run Tests**: Run `npx vitest run` (or `npx vitest` for watch mode) in the `compiler` directory. Ensure all test cases pass before proposing changes.
*   **Adding New Features**: If you are adding syntax specs or optimization passes, you must write corresponding test coverage inside the `src/tests/` folder.

## Pull Request (PR) Guidelines

1. Fork the repository to your account.
2. Create a new branch from `main` (`git checkout -b feature/amazing-feature`).
3. Commit your changes with clear, descriptive commit messages.
4. Verify that all tests pass (`npx vitest run`).
5. Push to your fork and submit a Pull Request targeting the `main` branch of the original repository.
6. The maintainers will review your PR and guide you through merging.
