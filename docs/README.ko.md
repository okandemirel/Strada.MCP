<div align="center">
  <h1>Strada.MCP</h1>
  <p><strong>가장 포괄적인 프레임워크 인식 Unity MCP 서버</strong></p>
  <p>49개 도구, 10개 리소스, 6개 프롬프트 — Strada.Core 인텔리전스, RAG 검색, Unity Editor 브리지</p>

  <p>
    <a href="https://github.com/okandemirel/Strada.MCP/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="라이선스: MIT"></a>
    <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg" alt="Node.js >= 20"></a>
    <a href="https://www.typescriptlang.org"><img src="https://img.shields.io/badge/TypeScript-5.x-blue.svg" alt="TypeScript 5.x"></a>
    <a href="https://modelcontextprotocol.io"><img src="https://img.shields.io/badge/MCP-호환-purple.svg" alt="MCP 호환"></a>
    <img src="https://img.shields.io/badge/Unity-2021.3%2B-black.svg" alt="Unity 2021.3+">
  </p>

  <p>
    <a href="../README.md">English</a> |
    <a href="README.tr.md">Turkce</a> |
    <a href="README.ja.md">日本語</a> |
    <a href="README.ko.md">한국어</a> |
    <a href="README.zh.md">中文</a> |
    <a href="README.de.md">Deutsch</a> |
    <a href="README.es.md">Espanol</a> |
    <a href="README.fr.md">Francais</a>
  </p>
</div>

---

## 개요

Strada.MCP는 Unity 및 Strada.Core 개발을 위해 특별히 설계된 Model Context Protocol(MCP) 서버입니다. AI 어시스턴트(Claude, GPT 등)를 Unity 워크플로우에 직접 연결합니다.

**이중 사용자 아키텍처:**
- **독립 모드** — Claude Desktop, Cursor, Windsurf, VS Code + Continue에서 바로 사용 가능
- **Brain 모드** — Strada.Brain과 통합하여 향상된 메모리, 학습, 목표 실행 제공

**왜 Strada.MCP인가?**
- **프레임워크 인식**: Strada.Core 패턴(ECS, MVCS, DI, 모듈)을 이해하는 유일한 Unity MCP 서버
- **포괄적 도구 세트**: 파일, git, .NET, 코드 분석, Strada 스캐폴딩, Unity 런타임 작업을 다루는 49개 도구
- **RAG 검색**: Tree-sitter C# 파싱 + Gemini 임베딩 + HNSW 벡터 검색
- **실시간 브리지**: 씬 조작, 컴포넌트 편집, 플레이 모드 제어를 위한 Unity Editor TCP 브리지
- **보안 우선**: 경로 탐색 방지, 자격 증명 스크럽, 읽기 전용 모드, 스크립트 실행 옵트인

## 빠른 시작

### 1. 설치

```bash
npm install -g strada-mcp
```

또는 소스에서 빌드:

```bash
git clone https://github.com/okandemirel/Strada.MCP.git
cd Strada.MCP
npm install
npm run build
```

### 2. IDE 설정

**Claude Desktop** — `~/Library/Application Support/Claude/claude_desktop_config.json`에 추가:

```json
{
  "mcpServers": {
    "strada-mcp": {
      "command": "strada-mcp",
      "env": {
        "UNITY_PROJECT_PATH": "/프로젝트/경로"
      }
    }
  }
}
```

**Cursor** — `.cursor/mcp.json`에 추가:

```json
{
  "mcpServers": {
    "strada-mcp": {
      "command": "strada-mcp",
      "env": {
        "UNITY_PROJECT_PATH": "/프로젝트/경로"
      }
    }
  }
}
```

### 3. Unity 패키지 설치 (선택 사항 — 전체 도구 접근용)

Unity Package Manager > "+" > Git URL에서 패키지 추가:

```
https://github.com/okandemirel/Strada.MCP.git?path=unity-package/com.strada.mcp
```

### 4. 사용 시작

AI 어시스턴트에게 Unity 프로젝트 작업을 요청하세요:
- "Current와 Max 필드가 있는 ECS Health 컴포넌트를 만들어줘"
- "Rigidbody 컴포넌트가 있는 모든 GameObject를 찾아줘"
- "프로젝트 아키텍처의 안티패턴을 분석해줘"
- "코드베이스에서 데미지 계산 로직을 검색해줘"

## 기능

### 도구 카테고리 (총 49개)

| 카테고리 | 수량 | Unity 브리지 필요 |
|---------|------|-------------------|
| Strada 프레임워크 | 10 | 아니오 |
| Unity 런타임 | 18 | 예 |
| 파일 작업 | 6 | 아니오 |
| 검색 | 3 | 아니오 |
| Git | 6 | 아니오 |
| .NET 빌드 | 2 | 아니오 |
| 분석 | 4 | 아니오 |

- **Unity 미실행**: 31개 도구 사용 가능 (파일, git, 검색, 분석, Strada 스캐폴딩, .NET)
- **Unity 실행**: 브리지를 통해 전체 49개 도구 활성화

### Strada 프레임워크 도구

이 도구들은 Strada.MCP 고유의 것으로 — 경쟁 제품에는 프레임워크 인식 스캐폴딩이 없습니다.

| 도구 | 설명 |
|------|------|
| `strada_create_component` | StructLayout이 있는 IComponent를 구현하는 ECS 컴포넌트 구조체 생성 |
| `strada_create_system` | Strada ECS 시스템 생성 (SystemBase, JobSystemBase 또는 BurstSystemBase) |
| `strada_create_module` | ModuleConfig, 어셈블리 정의, 폴더 구조가 있는 Strada 모듈 생성 |
| `strada_create_mediator` | ECS 컴포넌트를 Unity View에 바인딩하는 EntityMediator 생성 |
| `strada_create_service` | Strada 서비스 생성 (Service, TickableService, FixedTickableService, OrderedService) |
| `strada_create_controller` | 타입 모델 참조와 뷰 인젝션이 있는 Strada Controller 생성 |
| `strada_create_model` | 타입 프로퍼티가 있는 Strada Model 또는 ReactiveModel 생성 |
| `strada_analyze_project` | .cs 파일을 스캔하여 모듈, 시스템, 컴포넌트, 서비스, DI 사용 매핑 |
| `strada_validate_architecture` | Strada.Core 네이밍 규칙, 라이프타임 규칙, 의존성 규칙 검증 |
| `strada_scaffold_feature` | 완전한 기능 스켈레톤 생성: 모듈 + 컴포넌트 + 시스템 + 선택적 MVCS 뷰 |

### Unity 런타임 도구 (18개)

| 도구 | 설명 |
|------|------|
| `unity_create_gameobject` | 새 GameObject 생성 (빈 오브젝트, 프리미티브 또는 프리팹에서) |
| `unity_find_gameobjects` | 이름, 태그, 레이어 또는 컴포넌트 타입으로 GameObject 검색 |
| `unity_modify_gameobject` | GameObject 속성 수정 (이름, 활성, 태그, 레이어, 정적) |
| `unity_delete_gameobject` | 인스턴스 ID로 씬에서 GameObject 삭제 |
| `unity_duplicate_gameobject` | 선택적 새 이름, 부모, 오프셋으로 GameObject 복제 |
| `unity_add_component` | 타입 이름으로 GameObject에 컴포넌트 추가 |
| `unity_remove_component` | 타입 이름으로 GameObject에서 컴포넌트 제거 |
| `unity_get_components` | GameObject에 연결된 모든 컴포넌트 목록 |
| `unity_set_transform` | GameObject 트랜스폼의 위치, 회전, 스케일 설정 |
| `unity_get_transform` | GameObject의 현재 트랜스폼 가져오기 (위치, 회전, 스케일) |
| `unity_set_parent` | GameObject를 새 부모 트랜스폼 아래로 이동 |
| `unity_play` | Unity 플레이 모드 제어 (플레이, 일시 정지, 중지 또는 1프레임 진행) |
| `unity_get_play_state` | Unity Editor의 현재 플레이 상태 가져오기 |
| `unity_execute_menu` | 경로로 Unity Editor 메뉴 명령 실행 |
| `unity_console_log` | Unity 콘솔에 메시지 출력 (로그, 경고, 에러) |
| `unity_console_clear` | Unity Editor 콘솔 지우기 |
| `unity_selection_get` | Unity Editor에서 현재 선택된 오브젝트 가져오기 |
| `unity_selection_set` | 지정된 인스턴스 ID로 에디터 선택 설정 |

### 파일 및 검색 도구 (9개)

| 도구 | 설명 |
|------|------|
| `file_read` | 줄 번호와 함께 파일 내용 읽기, 선택적 오프셋/제한 |
| `file_write` | 파일에 내용 작성, 필요시 디렉토리 생성 |
| `file_edit` | 정확한 문자열 매칭으로 파일 내 텍스트 교체 |
| `file_delete` | 파일 삭제 |
| `file_rename` | 파일 이름 변경 또는 이동 |
| `list_directory` | 파일/디렉토리 표시와 함께 디렉토리 내용 목록 |
| `glob_search` | glob 패턴에 맞는 파일 검색 |
| `grep_search` | 정규식으로 파일 내용 검색, 선택적 컨텍스트 줄 |
| `code_search` | RAG 기반 시맨틱 코드 검색 (인덱싱 필요) |

### Git 도구 (6개)

| 도구 | 설명 |
|------|------|
| `git_status` | 작업 트리 상태 표시 (porcelain 형식) |
| `git_diff` | 작업 트리와 인덱스 간 차이 표시 |
| `git_log` | 커밋 이력 표시 |
| `git_commit` | 파일 스테이징 및 커밋 생성 |
| `git_branch` | 브랜치 목록, 생성, 삭제 또는 전환 |
| `git_stash` | 커밋되지 않은 변경사항 보관 또는 복원 |

### .NET 빌드 도구 (2개)

| 도구 | 설명 |
|------|------|
| `dotnet_build` | .NET 프로젝트 빌드 및 에러/경고 파싱 |
| `dotnet_test` | .NET 테스트 실행 및 결과 요약 파싱 |

### 분석 도구 (4개)

| 도구 | 설명 |
|------|------|
| `code_quality` | Strada.Core 안티패턴 및 모범 사례 위반에 대한 C# 코드 분석 |
| `csharp_parse` | C# 소스 코드를 클래스, 구조체, 메서드, 필드, 네임스페이스의 구조화된 AST로 파싱 |
| `dependency_graph` | Unity 프로젝트 어셈블리 참조 및 네임스페이스 의존성 분석, 순환 의존성 감지 |
| `project_health` | 코드 품질, 의존성 분석, 파일 통계를 결합한 종합적 프로젝트 상태 점검 |

### RAG 기반 코드 검색

```
C# 소스 -> Tree-sitter AST -> 구조적 청크 -> Gemini 임베딩 -> HNSW 벡터 인덱스
```

- 전체 프로젝트에 걸친 시맨틱 코드 검색
- 클래스/메서드/필드 경계 이해
- 증분 인덱싱 (변경된 파일만 재인덱싱)
- 하이브리드 리랭킹: 벡터 유사도 + 키워드 + 구조적 컨텍스트

### Unity Editor 브리지

Unity Editor에 대한 실시간 TCP 연결 (포트 7691):
- GameObject 생성, 검색, 수정, 삭제
- 컴포넌트 추가/제거/읽기
- 트랜스폼 조작 (위치, 회전, 스케일, 리페어런팅)
- 플레이 모드 제어 (플레이, 일시 정지, 중지, 스텝)
- 콘솔 출력 (로그, 경고, 에러, 지우기)
- 에디터 선택 관리
- 메뉴 명령 실행

## 리소스 (10개)

| URI | 설명 | 소스 |
|-----|------|------|
| `strada://api-reference` | Strada.Core API 문서 | 파일 기반 |
| `strada://namespaces` | Strada.Core 네임스페이스 계층 | 파일 기반 |
| `strada://examples/{pattern}` | 코드 예제 (ECS, MVCS, DI) | 파일 기반 |
| `unity://manifest` | Unity 패키지 매니페스트 | 파일 기반 |
| `unity://project-settings/{category}` | 카테고리별 Unity 프로젝트 설정 | 파일 기반 |
| `unity://assemblies` | Unity 어셈블리 정의 | 파일 기반 |
| `unity://file-stats` | Unity 프로젝트 파일 통계 | 파일 기반 |
| `unity://scene-hierarchy` | 활성 씬 계층 | 브리지 |
| `unity://console-logs` | 최근 콘솔 출력 | 브리지 |
| `unity://play-state` | 현재 플레이 모드 상태 | 브리지 |

## 프롬프트 (6개)

| 프롬프트 | 설명 |
|---------|------|
| `create_ecs_feature` | ECS 기능 생성 가이드 (컴포넌트, 시스템, 모듈 등록) |
| `create_mvcs_feature` | Strada.Core용 MVCS 패턴 스캐폴드 가이드 |
| `analyze_architecture` | Strada.Core 프로젝트용 아키텍처 리뷰 프롬프트 |
| `debug_performance` | Unity 프로젝트용 성능 디버깅 가이드 |
| `optimize_build` | Unity 프로젝트용 빌드 최적화 체크리스트 |
| `setup_scene` | Unity 프로젝트용 씬 설정 워크플로우 가이드 |

## 설정

모든 옵션은 환경 변수로 설정합니다:

| 변수 | 설명 | 기본값 |
|------|------|--------|
| `MCP_TRANSPORT` | 전송 모드: `stdio` 또는 `http` | `stdio` |
| `MCP_HTTP_PORT` | Streamable HTTP 포트 | `3100` |
| `MCP_HTTP_HOST` | HTTP 바인드 주소 | `127.0.0.1` |
| `UNITY_BRIDGE_PORT` | Unity Editor 브리지 TCP 포트 | `7691` |
| `UNITY_BRIDGE_AUTO_CONNECT` | 시작 시 Unity 자동 연결 | `true` |
| `UNITY_BRIDGE_TIMEOUT` | 브리지 연결 타임아웃 (ms) | `5000` |
| `UNITY_PROJECT_PATH` | Unity 프로젝트 경로 (비어있으면 자동 감지) | — |
| `EMBEDDING_PROVIDER` | 임베딩 제공자: `gemini`, `openai`, `ollama` | `gemini` |
| `EMBEDDING_MODEL` | 임베딩 모델 이름 | `gemini-embedding-2-preview` |
| `EMBEDDING_DIMENSIONS` | 임베딩 차원 (128-3072) | `768` |
| `EMBEDDING_API_KEY` | 임베딩 제공자 API 키 | — |
| `RAG_AUTO_INDEX` | 시작 시 자동 인덱싱 | `true` |
| `RAG_WATCH_FILES` | 파일 변경 감시 | `false` |
| `BRAIN_URL` | Strada.Brain HTTP URL (비어있음 = 비활성) | — |
| `BRAIN_API_KEY` | Brain API 키 | — |
| `READ_ONLY` | 전역 읽기 전용 모드 | `false` |
| `SCRIPT_EXECUTE_ENABLED` | Roslyn 스크립트 실행 활성화 | `false` |
| `MAX_FILE_SIZE` | 최대 파일 크기 (바이트) | `10485760` |
| `LOG_LEVEL` | 로그 수준: `debug`, `info`, `warn`, `error` | `info` |
| `LOG_FILE` | 로그 파일 경로 (비어있으면 stderr) | — |

## Brain 통합

Strada.Brain에 연결된 경우 (`BRAIN_URL` 설정 시):

- **공유 메모리**: Brain의 장기 메모리가 도구 제안에 활용
- **통합 RAG**: Brain 메모리 컨텍스트 + MCP tree-sitter AST 결합
- **학습**: 도구 사용 패턴이 Brain의 학습 파이프라인에 피드백
- **목표 실행**: Brain이 목표 계획의 일부로 MCP 도구 호출 가능

Brain 없이도 Strada.MCP는 완전히 독립적인 MCP 서버로 동작합니다.

## 보안

| 계층 | 보호 내용 |
|------|----------|
| 입력 검증 | 모든 도구에 Zod 스키마 + 타입 체크 |
| 경로 보호 | 디렉토리 탐색 방지, null 바이트 거부, 심볼릭 링크 탐색 방지 |
| 읽기 전용 모드 | 전역 + 도구별 쓰기 권한 강제 |
| 자격 증명 스크럽 | 모든 출력에서 API 키/토큰 패턴 스크럽 |
| 도구 허용 목록 | Unity 브리지는 등록된 JSON-RPC 명령만 수락 |
| 속도 제한 | 임베딩 API 속도 제한 보호 |
| Localhost 전용 | Unity 브리지는 127.0.0.1에만 바인딩 |
| 스크립트 실행 | Roslyn 실행 기본 비활성, 명시적 옵트인 필요 |

자세한 내용은 [SECURITY.md](../SECURITY.md)를 참조하세요.

## 개발

### 소스에서 빌드

```bash
git clone https://github.com/okandemirel/Strada.MCP.git
cd Strada.MCP
npm install
npm run build
```

### 테스트 실행

```bash
npm test              # 모든 테스트 실행
npm run test:watch    # 감시 모드
npm run typecheck     # TypeScript 타입 체크
```

### 개발 모드

```bash
npm run dev           # tsx로 실행 (자동 리로드)
```

## 기여

개발 설정, 코드 표준, PR 가이드라인은 [CONTRIBUTING.md](../CONTRIBUTING.md)를 참조하세요.

## 라이선스

MIT 라이선스. 자세한 내용은 [LICENSE](../LICENSE)를 참조하세요.
