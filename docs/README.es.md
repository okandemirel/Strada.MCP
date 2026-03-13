<div align="center">
  <h1>Strada.MCP</h1>
  <p><strong>El servidor MCP para Unity mas completo y consciente del framework</strong></p>
  <p>76 herramientas, 10 recursos, 6 prompts — con inteligencia Strada.Core, busqueda potenciada por RAG y puente al Unity Editor</p>

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

## Descripcion general

Strada.MCP es un servidor Model Context Protocol (MCP) disenado especificamente para el desarrollo con Unity y Strada.Core. Conecta asistentes de IA (Claude, GPT, etc.) directamente con tu flujo de trabajo en Unity.

**Arquitectura de doble usuario:**
- **Modo independiente** — Funciona de inmediato con Claude Desktop, Cursor, Windsurf, VS Code + Continue
- **Modo Brain** — Se integra con Strada.Brain para memoria mejorada, aprendizaje y ejecucion de objetivos

**Por que Strada.MCP?**
- **Consciente del framework**: El unico servidor MCP para Unity que entiende los patrones de Strada.Core (ECS, MVCS, DI, modulos)
- **Conjunto completo de herramientas**: 76 herramientas que cubren archivos, git, .NET, analisis de codigo, scaffolding de Strada, runtime de Unity, escenas/prefabs, assets, subsistemas y configuracion de proyecto
- **Busqueda potenciada por RAG**: Analisis C# con Tree-sitter + embeddings de Gemini + busqueda vectorial HNSW
- **Puente en tiempo real**: Conexion TCP al Unity Editor para manipulacion de escenas en vivo, edicion de componentes y control del modo de juego
- **Seguridad primero**: Prevencion de recorrido de rutas, limpieza de credenciales, modo solo lectura, ejecucion de scripts por opt-in

## Inicio rapido

### 1. Instalar

```bash
npm install -g strada-mcp
```

O clonar y compilar:

```bash
git clone https://github.com/okandemirel/Strada.MCP.git
cd Strada.MCP
npm install
npm run build
```

### 2. Configurar tu IDE

**Claude Desktop** — Agregar a `~/Library/Application Support/Claude/claude_desktop_config.json`:

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

**Cursor** — Agregar a `.cursor/mcp.json`:

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

### 3. Instalar el paquete de Unity (opcional — para acceso completo a herramientas)

Abre Unity Package Manager > "+" > Agregar paquete desde URL de git:

```
https://github.com/okandemirel/Strada.MCP.git?path=unity-package/com.strada.mcp
```

### 4. Comenzar a usar

Pide a tu asistente de IA que trabaje con tu proyecto Unity:
- "Crea un componente ECS Health con campos Current y Max"
- "Encuentra todos los GameObjects con el componente Rigidbody"
- "Analiza la arquitectura del proyecto en busca de anti-patrones"
- "Busca en el codigo la logica de calculo de dano"

## Caracteristicas

### Categorias de herramientas (76 en total)

| Categoria | Cantidad | Requiere Unity Bridge |
|-----------|----------|-----------------------|
| Strada Framework | 10 | No |
| Unity Runtime | 18 | Si |
| Unity Escena/Prefab | 8 | Mixto |
| Unity Asset | 8 | Mixto |
| Unity Subsistema | 6 | Si |
| Unity Configuracion | 4 | Si |
| Avanzado | 5 | Mixto |
| Operaciones de archivo | 6 | No |
| Busqueda | 3 | No |
| Git | 6 | No |
| .NET Build | 2 | No |
| Analisis | 4 | No |

- **Unity cerrado**: 35+ herramientas disponibles (archivos, git, busqueda, analisis, scaffolding de Strada, .NET, analisis de escenas/prefabs)
- **Unity abierto**: Las 76 herramientas activas a traves del puente

### Herramientas del framework Strada

Estas herramientas son exclusivas de Strada.MCP — ningun competidor ofrece scaffolding consciente del framework.

| Herramienta | Descripcion |
|-------------|-------------|
| `strada_create_component` | Generar una estructura de componente ECS que implementa IComponent con StructLayout |
| `strada_create_system` | Generar un sistema ECS de Strada (SystemBase, JobSystemBase o BurstSystemBase) |
| `strada_create_module` | Generar un modulo de Strada con ModuleConfig, definicion de assembly y estructura de carpetas |
| `strada_create_mediator` | Generar un EntityMediator que vincula componentes ECS a una Vista de Unity |
| `strada_create_service` | Generar un servicio de Strada (Service, TickableService, FixedTickableService u OrderedService) |
| `strada_create_controller` | Generar un Controller de Strada con referencia tipada al modelo e inyeccion de vista |
| `strada_create_model` | Generar un Model o ReactiveModel de Strada con propiedades tipadas |
| `strada_analyze_project` | Escanear archivos .cs para mapear modulos, sistemas, componentes, servicios y uso de DI |
| `strada_validate_architecture` | Validar convenciones de nomenclatura, reglas de ciclo de vida y reglas de dependencia de Strada.Core |
| `strada_scaffold_feature` | Generar un esqueleto completo de feature: modulo + componentes + sistemas + vistas MVCS opcionales |

### Herramientas de Unity Runtime (18)

| Herramienta | Descripcion |
|-------------|-------------|
| `unity_create_gameobject` | Crear un nuevo GameObject (vacio, primitivo o desde prefab) |
| `unity_find_gameobjects` | Buscar GameObjects por nombre, tag, capa o tipo de componente |
| `unity_modify_gameobject` | Modificar propiedades de GameObject (nombre, activo, tag, capa, estatico) |
| `unity_delete_gameobject` | Eliminar un GameObject de la escena por ID de instancia |
| `unity_duplicate_gameobject` | Duplicar un GameObject con nombre nuevo, padre o desplazamiento opcionales |
| `unity_add_component` | Agregar un componente a un GameObject por nombre de tipo |
| `unity_remove_component` | Eliminar un componente de un GameObject por nombre de tipo |
| `unity_get_components` | Listar todos los componentes adjuntos a un GameObject |
| `unity_set_transform` | Establecer posicion, rotacion y/o escala del Transform de un GameObject |
| `unity_get_transform` | Obtener el Transform actual (posicion, rotacion, escala) de un GameObject |
| `unity_set_parent` | Reasignar un GameObject bajo un nuevo Transform padre |
| `unity_play` | Controlar el modo de juego de Unity (reproducir, pausar, detener o avanzar un fotograma) |
| `unity_get_play_state` | Obtener el estado actual del modo de juego del editor de Unity |
| `unity_execute_menu` | Ejecutar un comando del menu del editor de Unity por ruta |
| `unity_console_log` | Escribir un mensaje en la consola de Unity (log, advertencia o error) |
| `unity_console_clear` | Limpiar la consola del editor de Unity |
| `unity_selection_get` | Obtener los objetos seleccionados actualmente en el editor de Unity |
| `unity_selection_set` | Establecer la seleccion del editor a los IDs de instancia especificados |

### Herramientas de archivo y busqueda (9)

| Herramienta | Descripcion |
|-------------|-------------|
| `file_read` | Leer contenido de archivo con numeros de linea, offset/limite opcionales |
| `file_write` | Escribir contenido en un archivo, creando directorios segun sea necesario |
| `file_edit` | Reemplazar texto en un archivo usando coincidencia exacta de cadenas |
| `file_delete` | Eliminar un archivo |
| `file_rename` | Renombrar o mover un archivo |
| `list_directory` | Listar contenido del directorio con indicadores de archivo/directorio |
| `glob_search` | Buscar archivos que coincidan con un patron glob |
| `grep_search` | Buscar contenido de archivos usando regex con lineas de contexto opcionales |
| `code_search` | Busqueda semantica de codigo potenciada por RAG (requiere indexacion) |

### Herramientas de Git (6)

| Herramienta | Descripcion |
|-------------|-------------|
| `git_status` | Mostrar estado del arbol de trabajo (formato porcelain) |
| `git_diff` | Mostrar cambios entre el arbol de trabajo y el indice (staged/unstaged) |
| `git_log` | Mostrar historial de commits |
| `git_commit` | Preparar archivos y crear un commit |
| `git_branch` | Listar, crear, eliminar o cambiar ramas |
| `git_stash` | Guardar o restaurar cambios no confirmados |

### Herramientas de compilacion .NET (2)

| Herramienta | Descripcion |
|-------------|-------------|
| `dotnet_build` | Compilar un proyecto .NET y analizar errores/advertencias |
| `dotnet_test` | Ejecutar pruebas .NET y analizar resumen de resultados |

### Herramientas de analisis (4)

| Herramienta | Descripcion |
|-------------|-------------|
| `code_quality` | Analizar codigo C# en busca de anti-patrones de Strada.Core y violaciones de mejores practicas |
| `csharp_parse` | Analizar codigo fuente C# en un AST estructurado con clases, structs, metodos, campos, namespaces |
| `dependency_graph` | Analizar referencias de assembly y dependencias de namespace del proyecto Unity, detectar dependencias circulares |
| `project_health` | Verificacion integral de salud del proyecto combinando calidad de codigo, analisis de dependencias y estadisticas de archivos |

### Herramientas de escena y prefab de Unity (8)

| Herramienta | Descripcion |
|-------------|-------------|
| `unity_scene_create` | Crear una nueva escena de Unity |
| `unity_scene_open` | Abrir una escena existente en el editor |
| `unity_scene_save` | Guardar la escena actual |
| `unity_scene_info` | Obtener metadatos y estadisticas de la escena |
| `unity_scene_analyze` | Analizar la jerarquia de la escena desde YAML (no requiere puente) |
| `unity_prefab_create` | Crear un nuevo prefab a partir de un GameObject |
| `unity_prefab_instantiate` | Instanciar un prefab en la escena actual |
| `unity_prefab_analyze` | Analizar la estructura del prefab desde YAML (no requiere puente) |

### Herramientas de assets de Unity (8)

| Herramienta | Descripcion |
|-------------|-------------|
| `unity_asset_find` | Buscar assets por nombre, tipo o etiqueta |
| `unity_asset_dependencies` | Analizar cadenas de dependencias de assets |
| `unity_asset_unused` | Encontrar assets potencialmente no utilizados en el proyecto |
| `unity_material_get` | Leer propiedades de material y asignaciones de shader |
| `unity_material_set` | Modificar propiedades de material |
| `unity_shader_list` | Listar shaders disponibles con keywords y propiedades |
| `unity_scriptableobject_create` | Crear un nuevo asset ScriptableObject |
| `unity_texture_info` | Obtener configuracion de importacion de textura y metadatos |

### Herramientas de subsistemas de Unity (6)

| Herramienta | Descripcion |
|-------------|-------------|
| `unity_animation_play` | Controlar la reproduccion del animator |
| `unity_animation_list` | Listar clips de animacion y parametros |
| `unity_physics_raycast` | Realizar raycasts de fisica en la escena |
| `unity_navmesh_bake` | Hornear o configurar ajustes de NavMesh |
| `unity_particles_control` | Controlar la reproduccion del sistema de particulas |
| `unity_lighting_bake` | Hornear iluminacion y configurar ajustes de luz |

### Herramientas de configuracion de Unity (4)

| Herramienta | Descripcion |
|-------------|-------------|
| `unity_player_settings` | Obtener/establecer ajustes del reproductor (empresa, producto, plataforma) |
| `unity_quality_settings` | Obtener/establecer niveles de calidad y ajustes graficos |
| `unity_build_settings` | Obtener/establecer objetivos de compilacion, escenas y opciones |
| `unity_project_settings` | Obtener/establecer tags, capas, fisica y ajustes de entrada |

### Herramientas avanzadas (5)

| Herramienta | Descripcion |
|-------------|-------------|
| `batch_execute` | Ejecutar multiples herramientas en una sola solicitud |
| `script_execute` | Ejecutar scripts C# a traves de Roslyn (opt-in, desactivado por defecto) |
| `script_validate` | Validar la sintaxis de un script C# sin ejecutarlo |
| `csharp_reflection` | Inspeccionar tipos, metodos y assemblies mediante reflexion |
| `unity_profiler` | Acceder a datos del perfilador de Unity y metricas de rendimiento |

### Busqueda de codigo potenciada por RAG

```
C# Source -> Tree-sitter AST -> Structural Chunks -> Gemini Embeddings -> HNSW Vector Index
```

- Busqueda semantica de codigo en todo el proyecto
- Comprende los limites de clases/metodos/campos
- Indexacion incremental (solo se reindezan los archivos modificados)
- Reordenamiento hibrido: similitud vectorial + palabras clave + contexto estructural

### Puente al Unity Editor

Conexion TCP en tiempo real al Unity Editor (puerto 7691):
- Crear, buscar, modificar, eliminar GameObjects
- Agregar/eliminar/leer componentes
- Manipulacion de Transform (posicion, rotacion, escala, reasignacion de padre)
- Control del modo de juego (reproducir, pausar, detener, avanzar paso a paso)
- Salida de consola (log, advertencia, error, limpiar)
- Gestion de seleccion del editor
- Ejecucion de comandos de menu

### Transmision de eventos

El puente transmite eventos del Unity Editor en tiempo real:
- `scene.changed` — Escena abierta, cerrada, guardada
- `console.line` — Nuevas entradas de log en la consola
- `compile.started` / `compile.finished` — Compilacion de scripts
- `playmode.changed` — Transiciones de reproducir/pausar/detener
- `selection.changed` — Cambios en la seleccion de objetos

## Recursos (10)

| URI | Descripcion | Origen |
|-----|-------------|--------|
| `strada://api-reference` | Documentacion de la API de Strada.Core | Basado en archivos |
| `strada://namespaces` | Jerarquia de namespaces de Strada.Core | Basado en archivos |
| `strada://examples/{pattern}` | Ejemplos de codigo (ECS, MVCS, DI) | Basado en archivos |
| `unity://manifest` | Manifiesto de paquetes de Unity (Packages/manifest.json) | Basado en archivos |
| `unity://project-settings/{category}` | Configuracion del proyecto Unity por categoria | Basado en archivos |
| `unity://assemblies` | Definiciones de assembly de Unity (archivos .asmdef) | Basado en archivos |
| `unity://file-stats` | Estadisticas de archivos del proyecto Unity | Basado en archivos |
| `unity://scene-hierarchy` | Jerarquia de la escena activa | Puente |
| `unity://console-logs` | Salida reciente de la consola | Puente |
| `unity://play-state` | Estado actual del modo de juego | Puente |

## Prompts (6)

| Prompt | Descripcion |
|--------|-------------|
| `create_ecs_feature` | Secuencia de multiples mensajes que guia la creacion de features ECS (componente, sistema, registro de modulo) |
| `create_mvcs_feature` | Guia de scaffolding del patron MVCS para Strada.Core |
| `analyze_architecture` | Prompt de revision de arquitectura para proyectos Strada.Core |
| `debug_performance` | Guia de depuracion de rendimiento para proyectos Unity |
| `optimize_build` | Lista de verificacion de optimizacion de compilacion para proyectos Unity |
| `setup_scene` | Guia de flujo de trabajo para configuracion de escenas en proyectos Unity |

## Instalacion

### Requisitos previos

- Node.js >= 20
- Unity 2021.3+ (para funciones del puente)
- Un proyecto Strada.Core (para herramientas del framework — opcional)

### npm (recomendado)

```bash
npm install -g strada-mcp
```

### Desde el codigo fuente

```bash
git clone https://github.com/okandemirel/Strada.MCP.git
cd Strada.MCP
npm install
npm run build
```

### Configuracion del IDE

#### Claude Desktop

Archivo: `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) o `%APPDATA%\Claude\claude_desktop_config.json` (Windows)

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

Archivo: `.cursor/mcp.json` en la raiz del workspace:

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

Archivo: `~/.windsurf/mcp.json`:

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

Archivo: `~/.claude/settings.json` o `.mcp.json` del proyecto:

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

Archivo: `.continue/config.json`:

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

## Configuracion del paquete Unity

### Instalar com.strada.mcp

1. Abre Unity > Window > Package Manager
2. Haz clic en "+" > "Add package from git URL..."
3. Ingresa: `https://github.com/okandemirel/Strada.MCP.git?path=unity-package/com.strada.mcp`
4. Haz clic en Add

### Configuracion

Despues de la instalacion:
1. Ve a **Strada > MCP > Settings**
2. Establece el puerto (por defecto: 7691)
3. Activa/desactiva el inicio automatico
4. Verifica que el indicador de estado de conexion se ponga verde cuando el servidor MCP se conecte

### Control manual

- **Strada > MCP > Start Server** — Iniciar el puente
- **Strada > MCP > Stop Server** — Detener el puente
- **Strada > MCP > Status** — Registrar el estado actual

## Configuracion

Todas las opciones se configuran mediante variables de entorno:

| Variable | Descripcion | Valor por defecto |
|----------|-------------|-------------------|
| `MCP_TRANSPORT` | Modo de transporte: `stdio` o `http` | `stdio` |
| `MCP_HTTP_PORT` | Puerto HTTP Streamable | `3100` |
| `MCP_HTTP_HOST` | Direccion de enlace HTTP | `127.0.0.1` |
| `UNITY_BRIDGE_PORT` | Puerto TCP para el puente del Unity Editor | `7691` |
| `UNITY_BRIDGE_AUTO_CONNECT` | Conectar automaticamente a Unity al iniciar | `true` |
| `UNITY_BRIDGE_TIMEOUT` | Tiempo de espera de conexion del puente (ms) | `5000` |
| `UNITY_PROJECT_PATH` | Ruta al proyecto Unity (deteccion automatica si esta vacia) | — |
| `EMBEDDING_PROVIDER` | Proveedor de embeddings: `gemini`, `openai`, `ollama` | `gemini` |
| `EMBEDDING_MODEL` | Nombre del modelo de embedding | `gemini-embedding-2-preview` |
| `EMBEDDING_DIMENSIONS` | Dimensiones de embedding (128-3072) | `768` |
| `EMBEDDING_API_KEY` | Clave API del proveedor de embeddings | — |
| `RAG_AUTO_INDEX` | Indexacion automatica al iniciar | `true` |
| `RAG_WATCH_FILES` | Monitorear cambios en archivos | `false` |
| `BRAIN_URL` | URL HTTP de Strada.Brain (vacio = desactivado) | — |
| `BRAIN_API_KEY` | Clave API de Brain | — |
| `ALLOWED_PATHS` | Lista separada por comas de directorios raiz permitidos | — |
| `READ_ONLY` | Modo global de solo lectura | `false` |
| `SCRIPT_EXECUTE_ENABLED` | Activar ejecucion de scripts Roslyn | `false` |
| `REFLECTION_INVOKE_ENABLED` | Activar invocacion de metodos por reflexion de C# | `false` |
| `MAX_FILE_SIZE` | Tamano maximo de archivo (bytes) | `10485760` |
| `LOG_LEVEL` | Nivel de log: `debug`, `info`, `warn`, `error` | `info` |
| `LOG_FILE` | Ruta del archivo de log (stderr si esta vacio) | — |

## Integracion con Brain

Cuando esta conectado a Strada.Brain (`BRAIN_URL` configurado):

- **Memoria compartida**: La memoria a largo plazo de Brain informa las sugerencias de herramientas
- **RAG combinado**: Contexto de memoria de Brain + AST de MCP Tree-sitter combinados
- **Aprendizaje**: Los patrones de uso de herramientas alimentan el pipeline de aprendizaje de Brain
- **Ejecucion de objetivos**: Brain puede invocar herramientas MCP como parte de planes de objetivos

Sin Brain, Strada.MCP opera como un servidor MCP completamente independiente.

## Seguridad

| Capa | Proteccion |
|------|-----------|
| Validacion de entrada | Esquema Zod + verificacion de tipos en todas las herramientas |
| Proteccion de rutas | Prevencion de recorrido de directorios, rechazo de bytes nulos, prevencion de recorrido de symlinks |
| Modo solo lectura | Aplicacion global + por herramienta de permisos de escritura |
| Limpieza de credenciales | Limpieza de patrones de claves API/tokens en todas las salidas |
| Lista blanca de herramientas | El puente de Unity solo acepta comandos JSON-RPC registrados |
| Limitacion de tasa | Proteccion de limitacion de tasa de la API de embeddings |
| Solo localhost | El puente de Unity se enlaza solo a 127.0.0.1 |
| Ejecucion de scripts | Ejecucion de Roslyn desactivada por defecto, opt-in explicito |

Para detalles completos, consulta [SECURITY.md](../SECURITY.md).

## Desarrollo

### Compilar desde el codigo fuente

```bash
git clone https://github.com/okandemirel/Strada.MCP.git
cd Strada.MCP
npm install
npm run build
```

### Ejecutar pruebas

```bash
npm test              # Ejecutar todas las pruebas
npm run test:watch    # Modo vigilancia
npm run typecheck     # Verificacion de tipos TypeScript
```

### Modo de desarrollo

```bash
npm run dev           # Ejecutar con tsx (recarga automatica)
```

### Estructura del proyecto

```
src/
  config/          - Configuracion validada con Zod
  security/        - Proteccion de rutas, sanitizador, validador
  tools/
    strada/        - 10 herramientas del framework Strada
    unity/         - 18 herramientas Unity dependientes del puente
    file/          - 6 herramientas de operaciones de archivo
    search/        - 3 herramientas de busqueda (glob, grep, RAG)
    git/           - 6 herramientas de git
    dotnet/        - 2 herramientas de compilacion .NET
    analysis/      - 4 herramientas de analisis de codigo
  intelligence/
    parser/        - Parser C# Tree-sitter
    rag/           - Embedding, chunker, indice HNSW
  bridge/          - Cliente TCP del puente Unity
  context/         - Cliente HTTP de Brain
  resources/       - 10 recursos MCP
  prompts/         - 6 prompts MCP
  utils/           - Logger, ejecutor de procesos

unity-package/
  com.strada.mcp/  - Paquete C# del Unity Editor (UPM)
```

## Contribuir

Consulta [CONTRIBUTING.md](../CONTRIBUTING.md) para la configuracion de desarrollo, estandares de codigo y directrices de PR.

## Licencia

Licencia MIT. Consulta [LICENSE](../LICENSE) para mas detalles.
