<div align="center">
  <h1>Strada.MCP</h1>
  <p><strong>El servidor MCP para Unity mas completo con reconocimiento de framework</strong></p>
  <p>49 herramientas, 10 recursos, 6 prompts — con inteligencia Strada.Core, busqueda RAG y puente al Editor de Unity</p>

  <p>
    <a href="https://github.com/okandemirel/Strada.MCP/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="Licencia: MIT"></a>
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

## Descripcion General

Strada.MCP es un servidor de Model Context Protocol (MCP) disenado especificamente para el desarrollo con Unity y Strada.Core. Conecta asistentes de IA (Claude, GPT, etc.) directamente a tu flujo de trabajo con Unity.

**Arquitectura de doble uso:**
- **Modo independiente** — Funciona directamente con Claude Desktop, Cursor, Windsurf, VS Code + Continue
- **Modo Brain** — Se integra con Strada.Brain para memoria mejorada, aprendizaje y ejecucion de objetivos

**Por que Strada.MCP?**
- **Reconocimiento de framework**: El unico servidor MCP para Unity que entiende patrones de Strada.Core (ECS, MVCS, DI, modulos)
- **Conjunto completo de herramientas**: 49 herramientas que cubren archivos, git, .NET, analisis de codigo, scaffolding de Strada y operaciones de runtime de Unity
- **Busqueda RAG**: Analisis Tree-sitter de C# + embeddings de Gemini + busqueda vectorial HNSW
- **Puente en tiempo real**: Puente TCP al Editor de Unity para manipulacion de escenas en vivo, edicion de componentes y control del modo de reproduccion
- **Seguridad primero**: Prevencion de recorrido de rutas, limpieza de credenciales, modo de solo lectura, ejecucion de scripts con activacion explicita

## Inicio Rapido

### 1. Instalacion

```bash
npm install -g strada-mcp
```

O compilar desde el codigo fuente:

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
        "UNITY_PROJECT_PATH": "/ruta/a/tu/proyecto"
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
        "UNITY_PROJECT_PATH": "/ruta/a/tu/proyecto"
      }
    }
  }
}
```

### 3. Instalar paquete Unity (opcional — para acceso completo a herramientas)

Unity Package Manager > "+" > Agregar paquete desde URL de Git:

```
https://github.com/okandemirel/Strada.MCP.git?path=unity-package/com.strada.mcp
```

### 4. Comenzar a usar

Pide a tu asistente de IA que trabaje con tu proyecto Unity:
- "Crea un componente ECS Health con campos Current y Max"
- "Encuentra todos los GameObjects con componente Rigidbody"
- "Analiza la arquitectura del proyecto en busca de anti-patrones"
- "Busca la logica de calculo de dano en el codigo"

## Caracteristicas

### Categorias de Herramientas (49 en total)

| Categoria | Cantidad | Requiere puente Unity |
|-----------|----------|-----------------------|
| Strada Framework | 10 | No |
| Unity Runtime | 18 | Si |
| Operaciones de archivo | 6 | No |
| Busqueda | 3 | No |
| Git | 6 | No |
| Compilacion .NET | 2 | No |
| Analisis | 4 | No |

- **Unity cerrado**: 31 herramientas disponibles (archivos, git, busqueda, analisis, scaffolding Strada, .NET)
- **Unity abierto**: Las 49 herramientas activas a traves del puente

### Herramientas de Strada Framework

Estas herramientas son exclusivas de Strada.MCP — ningun competidor tiene scaffolding con reconocimiento de framework.

| Herramienta | Descripcion |
|-------------|-------------|
| `strada_create_component` | Genera una estructura de componente ECS que implementa IComponent con StructLayout |
| `strada_create_system` | Genera un sistema ECS Strada (SystemBase, JobSystemBase o BurstSystemBase) |
| `strada_create_module` | Genera un modulo Strada con ModuleConfig, definicion de assembly y estructura de carpetas |
| `strada_create_mediator` | Genera un EntityMediator que vincula componentes ECS a una View de Unity |
| `strada_create_service` | Genera un servicio Strada (Service, TickableService, FixedTickableService, OrderedService) |
| `strada_create_controller` | Genera un Controller Strada con referencia de modelo tipada e inyeccion de vista |
| `strada_create_model` | Genera un Model o ReactiveModel Strada con propiedades tipadas |
| `strada_analyze_project` | Escanea archivos .cs para mapear modulos, sistemas, componentes, servicios y uso de DI |
| `strada_validate_architecture` | Valida convenciones de nombres, reglas de ciclo de vida y reglas de dependencia de Strada.Core |
| `strada_scaffold_feature` | Genera un esqueleto de funcionalidad completo: modulo + componentes + sistemas + vistas MVCS opcionales |

### Herramientas de Unity Runtime (18)

| Herramienta | Descripcion |
|-------------|-------------|
| `unity_create_gameobject` | Crear un nuevo GameObject (vacio, primitivo o desde prefab) |
| `unity_find_gameobjects` | Buscar GameObjects por nombre, etiqueta, capa o tipo de componente |
| `unity_modify_gameobject` | Modificar propiedades de GameObject (nombre, activo, etiqueta, capa, estatico) |
| `unity_delete_gameobject` | Eliminar un GameObject de la escena por ID de instancia |
| `unity_duplicate_gameobject` | Duplicar un GameObject con nombre, padre u offset opcionales |
| `unity_add_component` | Agregar un componente a un GameObject por nombre de tipo |
| `unity_remove_component` | Eliminar un componente de un GameObject por nombre de tipo |
| `unity_get_components` | Listar todos los componentes adjuntos a un GameObject |
| `unity_set_transform` | Establecer posicion, rotacion y/o escala del transform de un GameObject |
| `unity_get_transform` | Obtener el transform actual de un GameObject (posicion, rotacion, escala) |
| `unity_set_parent` | Mover un GameObject bajo un nuevo transform padre |
| `unity_play` | Controlar el modo de reproduccion de Unity (reproducir, pausar, detener o avanzar un fotograma) |
| `unity_get_play_state` | Obtener el estado actual de reproduccion del editor Unity |
| `unity_execute_menu` | Ejecutar un comando de menu del editor Unity por ruta |
| `unity_console_log` | Escribir un mensaje en la consola de Unity (log, advertencia o error) |
| `unity_console_clear` | Limpiar la consola del editor Unity |
| `unity_selection_get` | Obtener los objetos actualmente seleccionados en el editor Unity |
| `unity_selection_set` | Establecer la seleccion del editor a los IDs de instancia especificados |

### Herramientas de Archivo y Busqueda (9)

| Herramienta | Descripcion |
|-------------|-------------|
| `file_read` | Leer contenido de archivo con numeros de linea, offset/limite opcionales |
| `file_write` | Escribir contenido en un archivo, creando directorios segun sea necesario |
| `file_edit` | Reemplazar texto en un archivo usando coincidencia exacta de cadenas |
| `file_delete` | Eliminar un archivo |
| `file_rename` | Renombrar o mover un archivo |
| `list_directory` | Listar contenido de directorio con indicadores de archivo/directorio |
| `glob_search` | Buscar archivos que coincidan con un patron glob |
| `grep_search` | Buscar en contenido de archivos usando regex con lineas de contexto opcionales |
| `code_search` | Busqueda semantica de codigo basada en RAG (requiere indexacion) |

### Herramientas Git (6)

| Herramienta | Descripcion |
|-------------|-------------|
| `git_status` | Mostrar estado del arbol de trabajo (formato porcelain) |
| `git_diff` | Mostrar cambios entre el arbol de trabajo y el indice |
| `git_log` | Mostrar historial de commits |
| `git_commit` | Preparar archivos y crear un commit |
| `git_branch` | Listar, crear, eliminar o cambiar ramas |
| `git_stash` | Guardar o restaurar cambios no confirmados |

### Herramientas de Compilacion .NET (2)

| Herramienta | Descripcion |
|-------------|-------------|
| `dotnet_build` | Compilar un proyecto .NET y analizar errores/advertencias |
| `dotnet_test` | Ejecutar pruebas .NET y analizar el resumen de resultados |

### Herramientas de Analisis (4)

| Herramienta | Descripcion |
|-------------|-------------|
| `code_quality` | Analizar codigo C# en busca de anti-patrones y violaciones de mejores practicas de Strada.Core |
| `csharp_parse` | Analizar codigo fuente C# en un AST estructurado con clases, structs, metodos, campos, namespaces |
| `dependency_graph` | Analizar referencias de assembly y dependencias de namespace del proyecto Unity, detectar dependencias circulares |
| `project_health` | Verificacion integral de salud del proyecto combinando calidad de codigo, analisis de dependencias y estadisticas de archivos |

### Busqueda de Codigo RAG

```
Codigo C# -> Tree-sitter AST -> Fragmentos Estructurales -> Embeddings Gemini -> Indice Vectorial HNSW
```

- Busqueda semantica de codigo en todo el proyecto
- Comprende limites de clase/metodo/campo
- Indexacion incremental (solo archivos modificados se re-indexan)
- Re-ranking hibrido: similitud vectorial + palabras clave + contexto estructural

### Puente del Editor Unity

Conexion TCP en tiempo real al Editor de Unity (puerto 7691):
- Crear, buscar, modificar, eliminar GameObjects
- Agregar/eliminar/leer componentes
- Manipulacion de transform (posicion, rotacion, escala, re-parentado)
- Control de modo de reproduccion (reproducir, pausar, detener, paso)
- Salida de consola (log, advertencia, error, limpiar)
- Gestion de seleccion del editor
- Ejecucion de comandos de menu

## Recursos (10)

| URI | Descripcion | Fuente |
|-----|-------------|--------|
| `strada://api-reference` | Documentacion de API de Strada.Core | Basado en archivos |
| `strada://namespaces` | Jerarquia de namespaces de Strada.Core | Basado en archivos |
| `strada://examples/{pattern}` | Ejemplos de codigo (ECS, MVCS, DI) | Basado en archivos |
| `unity://manifest` | Manifiesto de paquetes Unity | Basado en archivos |
| `unity://project-settings/{category}` | Configuracion del proyecto Unity por categoria | Basado en archivos |
| `unity://assemblies` | Definiciones de assembly de Unity | Basado en archivos |
| `unity://file-stats` | Estadisticas de archivos del proyecto Unity | Basado en archivos |
| `unity://scene-hierarchy` | Jerarquia de escena activa | Puente |
| `unity://console-logs` | Salida reciente de consola | Puente |
| `unity://play-state` | Estado actual del modo de reproduccion | Puente |

## Prompts (6)

| Prompt | Descripcion |
|--------|-------------|
| `create_ecs_feature` | Guia de creacion de funcionalidad ECS (componente, sistema, registro de modulo) |
| `create_mvcs_feature` | Guia de scaffolding del patron MVCS para Strada.Core |
| `analyze_architecture` | Prompt de revision de arquitectura para proyectos Strada.Core |
| `debug_performance` | Guia de depuracion de rendimiento para proyectos Unity |
| `optimize_build` | Lista de verificacion de optimizacion de compilacion para proyectos Unity |
| `setup_scene` | Guia de flujo de trabajo para configuracion de escenas en proyectos Unity |

## Configuracion

Todas las opciones se configuran mediante variables de entorno:

| Variable | Descripcion | Valor predeterminado |
|----------|-------------|----------------------|
| `MCP_TRANSPORT` | Modo de transporte: `stdio` o `http` | `stdio` |
| `MCP_HTTP_PORT` | Puerto HTTP Streamable | `3100` |
| `MCP_HTTP_HOST` | Direccion de enlace HTTP | `127.0.0.1` |
| `UNITY_BRIDGE_PORT` | Puerto TCP para el puente del Editor Unity | `7691` |
| `UNITY_BRIDGE_AUTO_CONNECT` | Conexion automatica a Unity al iniciar | `true` |
| `UNITY_BRIDGE_TIMEOUT` | Timeout de conexion del puente (ms) | `5000` |
| `UNITY_PROJECT_PATH` | Ruta al proyecto Unity (deteccion automatica si esta vacio) | — |
| `EMBEDDING_PROVIDER` | Proveedor de embeddings: `gemini`, `openai`, `ollama` | `gemini` |
| `EMBEDDING_MODEL` | Nombre del modelo de embedding | `gemini-embedding-2-preview` |
| `EMBEDDING_DIMENSIONS` | Dimensiones del embedding (128-3072) | `768` |
| `EMBEDDING_API_KEY` | Clave API del proveedor de embeddings | — |
| `RAG_AUTO_INDEX` | Indexacion automatica al iniciar | `true` |
| `RAG_WATCH_FILES` | Vigilar cambios en archivos | `false` |
| `BRAIN_URL` | URL HTTP de Strada.Brain (vacio = deshabilitado) | — |
| `BRAIN_API_KEY` | Clave API de Brain | — |
| `READ_ONLY` | Modo global de solo lectura | `false` |
| `SCRIPT_EXECUTE_ENABLED` | Habilitar ejecucion de scripts Roslyn | `false` |
| `MAX_FILE_SIZE` | Tamano maximo de archivo (bytes) | `10485760` |
| `LOG_LEVEL` | Nivel de log: `debug`, `info`, `warn`, `error` | `info` |
| `LOG_FILE` | Ruta del archivo de log (stderr si esta vacio) | — |

## Integracion con Brain

Cuando se conecta a Strada.Brain (`BRAIN_URL` configurado):

- **Memoria compartida**: La memoria a largo plazo de Brain informa las sugerencias de herramientas
- **RAG unificado**: Contexto de memoria de Brain + AST tree-sitter de MCP combinados
- **Aprendizaje**: Los patrones de uso de herramientas retroalimentan la pipeline de aprendizaje de Brain
- **Ejecucion de objetivos**: Brain puede invocar herramientas MCP como parte de planes de objetivos

Sin Brain, Strada.MCP opera como un servidor MCP completamente independiente.

## Seguridad

| Capa | Proteccion |
|------|-----------|
| Validacion de entrada | Esquema Zod + verificacion de tipos en todas las herramientas |
| Proteccion de rutas | Prevencion de recorrido de directorios, rechazo de bytes nulos, prevencion de recorrido de enlaces simbolicos |
| Modo solo lectura | Aplicacion global + por herramienta de permisos de escritura |
| Limpieza de credenciales | Limpieza de patrones de claves API/tokens en toda la salida |
| Lista blanca de herramientas | El puente Unity solo acepta comandos JSON-RPC registrados |
| Limitacion de velocidad | Proteccion de limite de velocidad de API de embeddings |
| Solo localhost | El puente Unity se enlaza solo a 127.0.0.1 |
| Ejecucion de scripts | Ejecucion Roslyn deshabilitada por defecto, requiere activacion explicita |

Para mas detalles, consulte [SECURITY.md](../SECURITY.md).

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
npm run test:watch    # Modo de vigilancia
npm run typecheck     # Verificacion de tipos TypeScript
```

### Modo de desarrollo

```bash
npm run dev           # Ejecutar con tsx (recarga automatica)
```

## Contribuir

Para configuracion de desarrollo, estandares de codigo y directrices de PR, consulte [CONTRIBUTING.md](../CONTRIBUTING.md).

## Licencia

Licencia MIT. Para mas detalles, consulte [LICENSE](../LICENSE).
