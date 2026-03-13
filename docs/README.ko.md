<div align="center">
  <h1>Strada.MCP</h1>
  <p><strong>가장 포괄적인 프레임워크 인식 Unity MCP 서버</strong></p>
  <p>76개 도구, 10개 리소스, 6개 프롬프트 — Strada.Core 인텔리전스, RAG 기반 검색, Unity Editor 브리지 포함</p>

  <p>
    <a href="https://github.com/okandemirel/Strada.MCP/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License: MIT"></a>
    <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg" alt="Node.js >= 20"></a>
    <a href="https://www.typescriptlang.org"><img src="https://img.shields.io/badge/TypeScript-5.x-blue.svg" alt="TypeScript 5.x"></a>
    <a href="https://modelcontextprotocol.io"><img src="https://img.shields.io/badge/MCP-compatible-purple.svg" alt="MCP Compatible"></a>
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

Strada.MCP는 Unity 및 Strada.Core 개발을 위해 특별히 구축된 Model Context Protocol(MCP) 서버입니다. AI 어시스턴트(Claude, GPT 등)를 Unity 워크플로에 직접 연결합니다.

**듀얼 사용자 아키텍처:**
- **독립 실행 모드** — Claude Desktop, Cursor, Windsurf, VS Code + Continue와 즉시 사용 가능
- **Brain 모드** — Strada.Brain과 통합하여 향상된 메모리, 학습 및 목표 실행 제공

**왜 Strada.MCP인가?**
- **프레임워크 인식**: Strada.Core 패턴(ECS, MVCS, DI, 모듈)을 이해하는 유일한 Unity MCP 서버
- **완전한 도구 세트**: 파일, git, .NET, 코드 분석, Strada 스캐폴딩, Unity 런타임, 씬/프리팹, 에셋, 서브시스템, 프로젝트 설정을 포괄하는 76개 도구
- **RAG 기반 검색**: Tree-sitter C# 파싱 + Gemini 임베딩 + HNSW 벡터 검색
- **실시간 브리지**: 라이브 씬 조작, 컴포넌트 편집, 플레이 모드 제어를 위한 Unity Editor TCP 브리지
- **보안 우선**: 경로 순회 방지, 자격 증명 스크러빙, 읽기 전용 모드, 스크립트 실행 옵트인

## 빠른 시작

### 1. 설치

```bash
npm install -g strada-mcp
```

또는 클론 후 빌드:

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
        "UNITY_PROJECT_PATH": "/path/to/your/unity/project"
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
        "UNITY_PROJECT_PATH": "/path/to/your/unity/project"
      }
    }
  }
}
```

### 3. Unity 패키지 설치 (선택 사항 — 전체 도구 액세스용)

Unity Package Manager > "+" > Git URL에서 패키지 추가:

```
https://github.com/okandemirel/Strada.MCP.git?path=unity-package/com.strada.mcp
```

### 4. 사용 시작

AI 어시스턴트에게 Unity 프로젝트 작업을 요청하세요:
- "Current와 Max 필드가 있는 ECS Health 컴포넌트를 생성해줘"
- "Rigidbody 컴포넌트가 있는 모든 GameObject를 찾아줘"
- "프로젝트 아키텍처를 안티패턴 관점에서 분석해줘"
- "코드베이스에서 데미지 계산 로직을 검색해줘"

## 기능

### 도구 카테고리 (총 76개)

| 카테고리 | 수량 | Unity Bridge 필요 |
|----------|------|-------------------|
| Strada Framework | 10 | 아니오 |
| Unity 런타임 | 18 | 예 |
| Unity 씬/프리팹 | 8 | 혼합 |
| Unity 에셋 | 8 | 혼합 |
| Unity 서브시스템 | 6 | 예 |
| Unity 설정 | 4 | 예 |
| 고급 | 5 | 혼합 |
| 파일 작업 | 6 | 아니오 |
| 검색 | 3 | 아니오 |
| Git | 6 | 아니오 |
| .NET 빌드 | 2 | 아니오 |
| 분석 | 4 | 아니오 |

- **Unity 미실행**: 35개 이상의 도구 사용 가능 (파일, git, 검색, 분석, Strada 스캐폴딩, .NET, 씬/프리팹 분석)
- **Unity 실행 중**: 브리지를 통해 전체 76개 도구 활성화

### Strada Framework 도구

이 도구들은 Strada.MCP에만 있습니다. 프레임워크 인식 스캐폴딩을 제공하는 경쟁 제품은 없습니다.

| 도구 | 설명 |
|------|------|
| `strada_create_component` | StructLayout이 있는 IComponent를 구현하는 ECS 컴포넌트 구조체 생성 |
| `strada_create_system` | Strada ECS 시스템 생성 (SystemBase, JobSystemBase 또는 BurstSystemBase) |
| `strada_create_module` | ModuleConfig, 어셈블리 정의, 폴더 구조가 포함된 Strada 모듈 생성 |
| `strada_create_mediator` | ECS 컴포넌트를 Unity View에 바인딩하는 EntityMediator 생성 |
| `strada_create_service` | Strada 서비스 생성 (Service, TickableService, FixedTickableService 또는 OrderedService) |
| `strada_create_controller` | 타입 지정 모델 참조와 뷰 주입이 있는 Strada Controller 생성 |
| `strada_create_model` | 타입 지정 속성이 있는 Strada Model 또는 ReactiveModel 생성 |
| `strada_analyze_project` | .cs 파일을 스캔하여 모듈, 시스템, 컴포넌트, 서비스, DI 사용 현황 매핑 |
| `strada_validate_architecture` | Strada.Core 명명 규칙, 수명 규칙, 종속성 규칙 검증 |
| `strada_scaffold_feature` | 완전한 기능 스켈레톤 생성: 모듈 + 컴포넌트 + 시스템 + 선택적 MVCS 뷰 |

### Unity 런타임 도구 (18)

| 도구 | 설명 |
|------|------|
| `unity_create_gameobject` | 새 GameObject 생성 (빈 오브젝트, 프리미티브 또는 프리팹에서) |
| `unity_find_gameobjects` | 이름, 태그, 레이어 또는 컴포넌트 타입으로 GameObject 검색 |
| `unity_modify_gameobject` | GameObject 속성 수정 (이름, 활성, 태그, 레이어, 스태틱) |
| `unity_delete_gameobject` | 인스턴스 ID로 씬에서 GameObject 삭제 |
| `unity_duplicate_gameobject` | 선택적 새 이름, 부모 또는 오프셋으로 GameObject 복제 |
| `unity_add_component` | 타입 이름으로 GameObject에 컴포넌트 추가 |
| `unity_remove_component` | 타입 이름으로 GameObject에서 컴포넌트 제거 |
| `unity_get_components` | GameObject에 연결된 모든 컴포넌트 목록 표시 |
| `unity_set_transform` | GameObject 트랜스폼의 위치, 회전, 스케일 설정 |
| `unity_get_transform` | GameObject의 현재 트랜스폼 (위치, 회전, 스케일) 가져오기 |
| `unity_set_parent` | 새 부모 트랜스폼 아래로 GameObject 재배치 |
| `unity_play` | Unity 플레이 모드 제어 (재생, 일시정지, 정지 또는 한 프레임 진행) |
| `unity_get_play_state` | 현재 Unity 에디터 플레이 상태 가져오기 |
| `unity_execute_menu` | 경로로 Unity 에디터 메뉴 명령 실행 |
| `unity_console_log` | Unity 콘솔에 메시지 작성 (로그, 경고 또는 오류) |
| `unity_console_clear` | Unity 에디터 콘솔 지우기 |
| `unity_selection_get` | Unity 에디터에서 현재 선택된 오브젝트 가져오기 |
| `unity_selection_set` | 지정된 인스턴스 ID로 에디터 선택 설정 |

### 파일 및 검색 도구 (9)

| 도구 | 설명 |
|------|------|
| `file_read` | 줄 번호와 함께 파일 내용 읽기, 선택적 오프셋/리미트 |
| `file_write` | 필요시 디렉토리를 생성하며 파일에 내용 쓰기 |
| `file_edit` | 정확한 문자열 매칭을 사용하여 파일의 텍스트 교체 |
| `file_delete` | 파일 삭제 |
| `file_rename` | 파일 이름 변경 또는 이동 |
| `list_directory` | 파일/디렉토리 표시자와 함께 디렉토리 내용 목록 |
| `glob_search` | glob 패턴과 일치하는 파일 검색 |
| `grep_search` | 선택적 컨텍스트 줄과 함께 정규식으로 파일 내용 검색 |
| `code_search` | RAG 기반 시맨틱 코드 검색 (인덱싱 필요) |

### Git 도구 (6)

| 도구 | 설명 |
|------|------|
| `git_status` | 작업 트리 상태 표시 (porcelain 형식) |
| `git_diff` | 작업 트리와 인덱스 간 변경 사항 표시 (staged/unstaged) |
| `git_log` | 커밋 히스토리 표시 |
| `git_commit` | 파일 스테이징 및 커밋 생성 |
| `git_branch` | 브랜치 목록, 생성, 삭제 또는 전환 |
| `git_stash` | 커밋되지 않은 변경 사항 스태시 또는 복원 |

### .NET 빌드 도구 (2)

| 도구 | 설명 |
|------|------|
| `dotnet_build` | .NET 프로젝트 빌드 및 오류/경고 파싱 |
| `dotnet_test` | .NET 테스트 실행 및 결과 요약 파싱 |

### 분석 도구 (4)

| 도구 | 설명 |
|------|------|
| `code_quality` | Strada.Core 안티패턴 및 모범 사례 위반에 대한 C# 코드 분석 |
| `csharp_parse` | C# 소스 코드를 클래스, 구조체, 메서드, 필드, 네임스페이스가 포함된 구조화된 AST로 파싱 |
| `dependency_graph` | Unity 프로젝트 어셈블리 참조 및 네임스페이스 종속성 분석, 순환 종속성 감지 |
| `project_health` | 코드 품질, 종속성 분석, 파일 통계를 결합한 포괄적인 프로젝트 상태 검사 |

### Unity 씬 및 프리팹 도구 (8)

| 도구 | 설명 |
|------|------|
| `unity_scene_create` | 새 Unity 씬 생성 |
| `unity_scene_open` | 에디터에서 기존 씬 열기 |
| `unity_scene_save` | 현재 씬 저장 |
| `unity_scene_info` | 씬 메타데이터 및 통계 가져오기 |
| `unity_scene_analyze` | YAML에서 씬 계층 구조 분석 (브리지 불필요) |
| `unity_prefab_create` | GameObject에서 새 프리팹 생성 |
| `unity_prefab_instantiate` | 현재 씬에 프리팹 인스턴스화 |
| `unity_prefab_analyze` | YAML에서 프리팹 구조 분석 (브리지 불필요) |

### Unity 에셋 도구 (8)

| 도구 | 설명 |
|------|------|
| `unity_asset_find` | 이름, 타입 또는 레이블로 에셋 검색 |
| `unity_asset_dependencies` | 에셋 종속성 체인 분석 |
| `unity_asset_unused` | 프로젝트에서 잠재적으로 사용되지 않는 에셋 찾기 |
| `unity_material_get` | 머티리얼 속성 및 셰이더 할당 읽기 |
| `unity_material_set` | 머티리얼 속성 수정 |
| `unity_shader_list` | 키워드 및 속성과 함께 사용 가능한 셰이더 목록 |
| `unity_scriptableobject_create` | 새 ScriptableObject 에셋 생성 |
| `unity_texture_info` | 텍스처 임포트 설정 및 메타데이터 가져오기 |

### Unity 서브시스템 도구 (6)

| 도구 | 설명 |
|------|------|
| `unity_animation_play` | 애니메이터 재생 제어 |
| `unity_animation_list` | 애니메이션 클립 및 파라미터 목록 |
| `unity_physics_raycast` | 씬에서 물리 레이캐스트 수행 |
| `unity_navmesh_bake` | NavMesh 설정 베이크 또는 구성 |
| `unity_particles_control` | 파티클 시스템 재생 제어 |
| `unity_lighting_bake` | 라이팅 베이크 및 조명 설정 구성 |

### Unity 설정 도구 (4)

| 도구 | 설명 |
|------|------|
| `unity_player_settings` | 플레이어 설정 가져오기/설정 (회사, 제품, 플랫폼) |
| `unity_quality_settings` | 품질 레벨 및 그래픽 설정 가져오기/설정 |
| `unity_build_settings` | 빌드 대상, 씬, 옵션 가져오기/설정 |
| `unity_project_settings` | 태그, 레이어, 물리, 입력 설정 가져오기/설정 |

### 고급 도구 (5)

| 도구 | 설명 |
|------|------|
| `batch_execute` | 단일 요청으로 여러 도구 실행 |
| `script_execute` | Roslyn을 통한 C# 스크립트 실행 (옵트인, 기본적으로 비활성화) |
| `script_validate` | 실행 없이 C# 스크립트 구문 검증 |
| `csharp_reflection` | 리플렉션을 통해 타입, 메서드, 어셈블리 검사 |
| `unity_profiler` | Unity 프로파일러 데이터 및 성능 메트릭 액세스 |

### RAG 기반 코드 검색

```
C# 소스 -> Tree-sitter AST -> 구조적 청크 -> Gemini Embeddings -> HNSW 벡터 인덱스
```

- 전체 프로젝트에 걸친 시맨틱 코드 검색
- 클래스/메서드/필드 경계 이해
- 증분 인덱싱 (변경된 파일만 재인덱싱)
- 하이브리드 리랭킹: 벡터 유사도 + 키워드 + 구조적 컨텍스트

### Unity Editor 브리지

Unity Editor에 대한 실시간 TCP 연결 (포트 7691):
- GameObject 생성, 검색, 수정, 삭제
- 컴포넌트 추가/제거/읽기
- 트랜스폼 조작 (위치, 회전, 스케일, 재배치)
- 플레이 모드 제어 (재생, 일시정지, 정지, 스텝)
- 콘솔 출력 (로그, 경고, 오류, 지우기)
- 에디터 선택 관리
- 메뉴 명령 실행

### 이벤트 스트리밍

브리지는 Unity Editor 이벤트를 실시간으로 브로드캐스트합니다:
- `scene.changed` — 씬 열림, 닫힘, 저장됨
- `console.line` — 새 콘솔 로그 항목
- `compile.started` / `compile.finished` — 스크립트 컴파일
- `playmode.changed` — 재생/일시정지/정지 전환
- `selection.changed` — 선택된 오브젝트 변경

## 리소스 (10)

| URI | 설명 | 소스 |
|-----|------|------|
| `strada://api-reference` | Strada.Core API 문서 | 파일 기반 |
| `strada://namespaces` | Strada.Core 네임스페이스 계층 구조 | 파일 기반 |
| `strada://examples/{pattern}` | 코드 예제 (ECS, MVCS, DI) | 파일 기반 |
| `unity://manifest` | Unity 패키지 매니페스트 (Packages/manifest.json) | 파일 기반 |
| `unity://project-settings/{category}` | 카테고리별 Unity 프로젝트 설정 | 파일 기반 |
| `unity://assemblies` | Unity 어셈블리 정의 (.asmdef 파일) | 파일 기반 |
| `unity://file-stats` | Unity 프로젝트 파일 통계 | 파일 기반 |
| `unity://scene-hierarchy` | 활성 씬 계층 구조 | Bridge |
| `unity://console-logs` | 최근 콘솔 출력 | Bridge |
| `unity://play-state` | 현재 플레이 모드 상태 | Bridge |

## 프롬프트 (6)

| 프롬프트 | 설명 |
|----------|------|
| `create_ecs_feature` | ECS 기능 생성을 안내하는 다중 메시지 시퀀스 (컴포넌트, 시스템, 모듈 등록) |
| `create_mvcs_feature` | Strada.Core용 MVCS 패턴 스캐폴드 가이드 |
| `analyze_architecture` | Strada.Core 프로젝트용 아키텍처 리뷰 프롬프트 |
| `debug_performance` | Unity 프로젝트용 성능 디버깅 가이드 |
| `optimize_build` | Unity 프로젝트용 빌드 최적화 체크리스트 |
| `setup_scene` | Unity 프로젝트용 씬 설정 워크플로 가이드 |

## 설치

### 필수 조건

- Node.js >= 20
- Unity 2021.3+ (브리지 기능용)
- Strada.Core 프로젝트 (프레임워크 도구용 — 선택 사항)

### npm (권장)

```bash
npm install -g strada-mcp
```

### 소스에서

```bash
git clone https://github.com/okandemirel/Strada.MCP.git
cd Strada.MCP
npm install
npm run build
```

### IDE 설정

#### Claude Desktop

파일: `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) 또는 `%APPDATA%\Claude\claude_desktop_config.json` (Windows)

```json
{
  "mcpServers": {
    "strada-mcp": {
      "command": "strada-mcp",
      "env": {
        "UNITY_PROJECT_PATH": "/path/to/project",
        "EMBEDDING_API_KEY": "your-gemini-key"
      }
    }
  }
}
```

#### Cursor

파일: 워크스페이스 루트의 `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "strada-mcp": {
      "command": "npx",
      "args": ["strada-mcp"],
      "env": {
        "UNITY_PROJECT_PATH": "/path/to/project"
      }
    }
  }
}
```

#### Windsurf

파일: `~/.windsurf/mcp.json`:

```json
{
  "mcpServers": {
    "strada-mcp": {
      "command": "strada-mcp",
      "env": {
        "UNITY_PROJECT_PATH": "/path/to/project"
      }
    }
  }
}
```

#### Claude Code

파일: `~/.claude/settings.json` 또는 프로젝트 `.mcp.json`:

```json
{
  "mcpServers": {
    "strada-mcp": {
      "command": "strada-mcp",
      "env": {
        "UNITY_PROJECT_PATH": "/path/to/project"
      }
    }
  }
}
```

#### VS Code + Continue

파일: `.continue/config.json`:

```json
{
  "experimental": {
    "modelContextProtocolServers": [
      {
        "transport": {
          "type": "stdio",
          "command": "strada-mcp",
          "env": {
            "UNITY_PROJECT_PATH": "/path/to/project"
          }
        }
      }
    ]
  }
}
```

## Unity 패키지 설정

### com.strada.mcp 설치

1. Unity > Window > Package Manager 열기
2. "+" > "Add package from git URL..." 클릭
3. 입력: `https://github.com/okandemirel/Strada.MCP.git?path=unity-package/com.strada.mcp`
4. Add 클릭

### 설정

설치 후:
1. **Strada > MCP > Settings**로 이동
2. 포트 설정 (기본값: 7691)
3. 자동 시작 활성화/비활성화
4. MCP 서버 연결 시 연결 상태 표시기가 녹색으로 변하는지 확인

### 수동 제어

- **Strada > MCP > Start Server** — 브리지 시작
- **Strada > MCP > Stop Server** — 브리지 중지
- **Strada > MCP > Status** — 현재 상태 로그

## 설정

모든 옵션은 환경 변수를 통해 설정합니다:

| 변수 | 설명 | 기본값 |
|------|------|--------|
| `MCP_TRANSPORT` | 전송 모드: `stdio` 또는 `http` | `stdio` |
| `MCP_HTTP_PORT` | 스트리머블 HTTP 포트 | `3100` |
| `MCP_HTTP_HOST` | HTTP 바인드 주소 | `127.0.0.1` |
| `UNITY_BRIDGE_PORT` | Unity Editor 브리지용 TCP 포트 | `7691` |
| `UNITY_BRIDGE_AUTO_CONNECT` | 시작 시 Unity에 자동 연결 | `true` |
| `UNITY_BRIDGE_TIMEOUT` | 브리지 연결 타임아웃 (ms) | `5000` |
| `UNITY_PROJECT_PATH` | Unity 프로젝트 경로 (비어있으면 자동 감지) | — |
| `EMBEDDING_PROVIDER` | 임베딩 제공자: `gemini`, `openai`, `ollama` | `gemini` |
| `EMBEDDING_MODEL` | 임베딩 모델 이름 | `gemini-embedding-2-preview` |
| `EMBEDDING_DIMENSIONS` | 임베딩 차원 (128-3072) | `768` |
| `EMBEDDING_API_KEY` | 임베딩 제공자용 API 키 | — |
| `RAG_AUTO_INDEX` | 시작 시 자동 인덱싱 | `true` |
| `RAG_WATCH_FILES` | 파일 변경 감시 | `false` |
| `BRAIN_URL` | Strada.Brain HTTP URL (비어있음 = 비활성화) | — |
| `BRAIN_API_KEY` | Brain API 키 | — |
| `ALLOWED_PATHS` | 쉼표로 구분된 허용 루트 디렉토리 목록 | — |
| `READ_ONLY` | 전역 읽기 전용 모드 | `false` |
| `SCRIPT_EXECUTE_ENABLED` | Roslyn 스크립트 실행 활성화 | `false` |
| `REFLECTION_INVOKE_ENABLED` | C# 리플렉션 메서드 호출 활성화 | `false` |
| `MAX_FILE_SIZE` | 최대 파일 크기 (바이트) | `10485760` |
| `LOG_LEVEL` | 로그 레벨: `debug`, `info`, `warn`, `error` | `info` |
| `LOG_FILE` | 로그 파일 경로 (비어있으면 stderr) | — |

## Brain 통합

Strada.Brain에 연결된 경우 (`BRAIN_URL` 설정됨):

- **공유 메모리**: Brain의 장기 메모리가 도구 제안에 활용됨
- **통합 RAG**: Brain 메모리 컨텍스트 + MCP Tree-sitter AST 결합
- **학습**: 도구 사용 패턴이 Brain의 학습 파이프라인에 피드백
- **목표 실행**: Brain이 목표 계획의 일부로 MCP 도구를 호출 가능

Brain 없이도 Strada.MCP는 완전히 독립적인 MCP 서버로 작동합니다.

## 보안

| 계층 | 보호 |
|------|------|
| 입력 유효성 검사 | 모든 도구에 Zod 스키마 + 타입 검사 |
| 경로 가드 | 디렉토리 순회 방지, null 바이트 거부, 심볼릭 링크 순회 방지 |
| 읽기 전용 모드 | 전역 + 도구별 쓰기 권한 적용 |
| 자격 증명 스크러빙 | 모든 출력에서 API 키/토큰 패턴 스크러빙 |
| 도구 화이트리스트 | Unity 브리지는 등록된 JSON-RPC 명령만 수락 |
| 속도 제한 | Embedding API 속도 제한 보호 |
| 로컬호스트만 | Unity 브리지는 127.0.0.1에만 바인딩 |
| 스크립트 실행 | Roslyn 실행은 기본적으로 비활성화, 명시적 옵트인 필요 |

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
npm run test:watch    # 워치 모드
npm run typecheck     # TypeScript 타입 검사
```

### 개발 모드

```bash
npm run dev           # tsx로 실행 (자동 리로드)
```

### 프로젝트 구조

```
src/
  config/          - Zod 검증 설정
  security/        - 경로 가드, 새니타이저, 유효성 검사기
  tools/
    strada/        - 10 Strada framework 도구
    unity/         - 18 브리지 의존 Unity 도구
    file/          - 6 파일 작업 도구
    search/        - 3 검색 도구 (glob, grep, RAG)
    git/           - 6 git 도구
    dotnet/        - 2 .NET 빌드 도구
    analysis/      - 4 코드 분석 도구
  intelligence/
    parser/        - Tree-sitter C# 파서
    rag/           - 임베딩, 청커, HNSW 인덱스
  bridge/          - Unity TCP 브리지 클라이언트
  context/         - Brain HTTP 클라이언트
  resources/       - 10 MCP 리소스
  prompts/         - 6 MCP 프롬프트
  utils/           - 로거, 프로세스 러너

unity-package/
  com.strada.mcp/  - C# Unity Editor 패키지 (UPM)
```

## 기여

개발 환경 설정, 코드 표준, PR 가이드라인은 [CONTRIBUTING.md](../CONTRIBUTING.md)를 참조하세요.

## 라이선스

MIT 라이선스. 자세한 내용은 [LICENSE](../LICENSE)를 참조하세요.
