<p align="right">
  <strong>한국어</strong> | <a href="./CONTRIBUTING_EN.md">English</a>
</p>

# ScriptRowberry 기여 가이드라인 (Contributing Guidelines)

ScriptRowberry 프로젝트에 관심을 가져주셔서 감사합니다! 이 프로젝트는 비트 레벨 정밀도로 구동되는 WebAssembly 시스템 언어이며, 오픈소스로 모든 형태의 기여를 환영합니다.

## 기여하기 전에

1. 기존의 오픈된 [이슈(Issues)](https://github.com/imsohappisy/scriptrawberry/issues) 목록에서 개발하고자 하는 기능이나 해결하려는 버그가 이미 논의 중인지 확인해 주세요.
2. 새로운 버그를 발견했거나 기능을 제안하고 싶다면 신규 이슈를 먼저 생성해 주세요.

## 개발 환경 설정

본 프로젝트의 컴파일러 코어는 `compiler` 디렉토리에 위치해 있습니다.

```bash
# 1. 저장소 복제 및 디렉토리 이동
git clone https://github.com/imsohappisy/scriptrawberry.git
cd scriptrawberry/compiler

# 2. 의존성 패키지 설치 (pnpm 권장)
npx pnpm install

# 3. 브라우저용 API 번들 빌드
node build.js
# 빌드 성공 시 dist/scriptrawberry.js 파일이 갱신됩니다.
```

## 코드 작성 및 테스트

우리는 안정적인 컴파일러 코어 유지를 위해 테스트를 철저하게 실행합니다.

*   **테스트 실행**: `compiler` 디렉토리 아래에서 `npx vitest run` 또는 실시간 감시 모드인 `npx vitest`를 실행하여 40개 이상의 유닛 테스트 케이스가 통과하는지 확인해 주세요.
*   **새로운 기능 추가**: 새로운 문법이나 최적화 패스를 추가하는 경우, 반드시 `src/tests/` 폴더 아래에 관련 테스트 커버리지를 작성해야 합니다.

## 풀 리퀘스트(PR) 제출 절차

1. 저장소를 본인 계정으로 Fork합니다.
2. `main` 브랜치로부터 새로운 기능 브랜치를 만듭니다 (`git checkout -b feature/amazing-feature`).
3. 코드를 작성하고 테스트가 모두 통과하는지 확인합니다 (`npx vitest run`).
4. 변경 사항을 커밋합니다. 직관적이고 명확한 커밋 메시지를 사용해 주세요.
5. 본인의 원격 저장소에 푸시한 후, 원본 저장소의 `main` 브랜치를 향해 Pull Request를 제출합니다.
6. 프로젝트 관리자가 코드 리뷰 후 검토 및 머지를 진행합니다.
