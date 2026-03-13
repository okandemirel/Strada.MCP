<div align="center">
  <h1>Strada.MCP</h1>
  <p><strong>Der umfassendste framework-bewusste Unity MCP-Server</strong></p>
  <p>76 Tools, 10 Ressourcen, 6 Prompts — mit Strada.Core-Intelligenz, RAG-basierter Suche und Unity Editor-Bridge</p>

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

## Ueberblick

Strada.MCP ist ein Model Context Protocol (MCP)-Server, der speziell fuer Unity- und Strada.Core-Entwicklung konzipiert wurde. Er verbindet KI-Assistenten (Claude, GPT usw.) direkt mit Ihrem Unity-Workflow.

**Dual-User-Architektur:**
- **Standalone-Modus** — Funktioniert sofort mit Claude Desktop, Cursor, Windsurf, VS Code + Continue
- **Brain-Modus** — Integration mit Strada.Brain fuer erweitertes Gedaechtnis, Lernen und Zielausfuehrung

**Warum Strada.MCP?**
- **Framework-bewusst**: Der einzige Unity MCP-Server, der Strada.Core-Muster versteht (ECS, MVCS, DI, Module)
- **Vollstaendiges Toolset**: 76 Tools fuer Dateien, Git, .NET, Code-Analyse, Strada-Scaffolding, Unity-Runtime, Szenen/Prefabs, Assets, Subsysteme und Projektkonfiguration
- **RAG-basierte Suche**: Tree-sitter C#-Parsing + Gemini-Embeddings + HNSW-Vektorsuche
- **Echtzeit-Bridge**: TCP-Verbindung zum Unity Editor fuer Live-Szenenmanipulation, Komponentenbearbeitung und Play-Mode-Steuerung
- **Sicherheit zuerst**: Pfad-Traversal-Schutz, Credential-Bereinigung, Nur-Lesen-Modus, Script-Ausfuehrung nur auf Opt-in-Basis

## Schnellstart

### 1. Installation

```bash
npm install -g strada-mcp
```

Oder klonen und bauen:

```bash
git clone https://github.com/okandemirel/Strada.MCP.git
cd Strada.MCP
npm install
npm run build
```

### 2. IDE konfigurieren

**Claude Desktop** — Zur Datei `~/Library/Application Support/Claude/claude_desktop_config.json` hinzufuegen:

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

**Cursor** — Zur Datei `.cursor/mcp.json` hinzufuegen:

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

### 3. Unity-Paket installieren (optional — fuer vollstaendigen Tool-Zugriff)

Oeffnen Sie den Unity Package Manager > "+" > Paket per Git-URL hinzufuegen:

```
https://github.com/okandemirel/Strada.MCP.git?path=unity-package/com.strada.mcp
```

### 4. Loslegen

Bitten Sie Ihren KI-Assistenten, mit Ihrem Unity-Projekt zu arbeiten:
- "Erstelle eine ECS Health-Komponente mit Current- und Max-Feldern"
- "Finde alle GameObjects mit der Rigidbody-Komponente"
- "Analysiere die Projektarchitektur auf Anti-Patterns"
- "Durchsuche die Codebasis nach Schadensberechnungslogik"

## Funktionen

### Tool-Kategorien (76 insgesamt)

| Kategorie | Anzahl | Unity Bridge erforderlich |
|-----------|--------|--------------------------|
| Strada Framework | 10 | Nein |
| Unity Runtime | 18 | Ja |
| Unity Szene/Prefab | 8 | Gemischt |
| Unity Asset | 8 | Gemischt |
| Unity Subsystem | 6 | Ja |
| Unity Konfiguration | 4 | Ja |
| Erweitert | 5 | Gemischt |
| Dateioperationen | 6 | Nein |
| Suche | 3 | Nein |
| Git | 6 | Nein |
| .NET Build | 2 | Nein |
| Analyse | 4 | Nein |

- **Unity geschlossen**: 35+ Tools verfuegbar (Datei, Git, Suche, Analyse, Strada-Scaffolding, .NET, Szenen-/Prefab-Analyse)
- **Unity geoeffnet**: Alle 76 Tools ueber die Bridge aktiv

### Strada Framework Tools

Diese Tools sind einzigartig fuer Strada.MCP — kein Wettbewerber bietet framework-bewusstes Scaffolding.

| Tool | Beschreibung |
|------|-------------|
| `strada_create_component` | ECS-Komponentenstruktur generieren, die IComponent mit StructLayout implementiert |
| `strada_create_system` | Strada ECS-System generieren (SystemBase, JobSystemBase oder BurstSystemBase) |
| `strada_create_module` | Strada-Modul mit ModuleConfig, Assembly-Definition und Ordnerstruktur generieren |
| `strada_create_mediator` | EntityMediator generieren, der ECS-Komponenten an eine Unity-View bindet |
| `strada_create_service` | Strada-Service generieren (Service, TickableService, FixedTickableService oder OrderedService) |
| `strada_create_controller` | Strada Controller mit typisierter Model-Referenz und View-Injection generieren |
| `strada_create_model` | Strada Model oder ReactiveModel mit typisierten Eigenschaften generieren |
| `strada_analyze_project` | .cs-Dateien scannen, um Module, Systeme, Komponenten, Services und DI-Nutzung zu erfassen |
| `strada_validate_architecture` | Strada.Core-Namenskonventionen, Lebenszyklus-Regeln und Abhaengigkeitsregeln validieren |
| `strada_scaffold_feature` | Komplettes Feature-Geruest generieren: Modul + Komponenten + Systeme + optionale MVCS-Views |

### Unity Runtime Tools (18)

| Tool | Beschreibung |
|------|-------------|
| `unity_create_gameobject` | Neues GameObject erstellen (leer, Primitiv oder aus Prefab) |
| `unity_find_gameobjects` | GameObjects nach Name, Tag, Layer oder Komponententyp suchen |
| `unity_modify_gameobject` | GameObject-Eigenschaften aendern (Name, Aktiv, Tag, Layer, Statisch) |
| `unity_delete_gameobject` | GameObject anhand der Instanz-ID aus der Szene loeschen |
| `unity_duplicate_gameobject` | GameObject duplizieren mit optionalem neuen Namen, Parent oder Offset |
| `unity_add_component` | Komponente zu einem GameObject ueber den Typnamen hinzufuegen |
| `unity_remove_component` | Komponente von einem GameObject ueber den Typnamen entfernen |
| `unity_get_components` | Alle an ein GameObject angehaengten Komponenten auflisten |
| `unity_set_transform` | Position, Rotation und/oder Skalierung eines GameObject-Transforms setzen |
| `unity_get_transform` | Aktuellen Transform (Position, Rotation, Skalierung) eines GameObjects abrufen |
| `unity_set_parent` | GameObject unter einen neuen Parent-Transform umhaengen |
| `unity_play` | Unity Play-Modus steuern (Abspielen, Pausieren, Stoppen oder einen Frame weiterschalten) |
| `unity_get_play_state` | Aktuellen Unity Editor Play-Status abrufen |
| `unity_execute_menu` | Unity Editor-Menubefehle ueber den Pfad ausfuehren |
| `unity_console_log` | Nachricht in die Unity-Konsole schreiben (Log, Warnung oder Fehler) |
| `unity_console_clear` | Unity Editor-Konsole leeren |
| `unity_selection_get` | Aktuell ausgewaehlte Objekte im Unity Editor abrufen |
| `unity_selection_set` | Editor-Auswahl auf die angegebenen Instanz-IDs setzen |

### Datei- & Such-Tools (9)

| Tool | Beschreibung |
|------|-------------|
| `file_read` | Dateiinhalt mit Zeilennummern lesen, optionaler Offset/Limit |
| `file_write` | Inhalt in eine Datei schreiben, Verzeichnisse bei Bedarf erstellen |
| `file_edit` | Text in einer Datei durch exakte Zeichenkettenuebereinstimmung ersetzen |
| `file_delete` | Datei loeschen |
| `file_rename` | Datei umbenennen oder verschieben |
| `list_directory` | Verzeichnisinhalte mit Datei-/Verzeichnis-Indikatoren auflisten |
| `glob_search` | Dateien suchen, die einem Glob-Muster entsprechen |
| `grep_search` | Dateiinhalte mit Regex und optionalen Kontextzeilen durchsuchen |
| `code_search` | RAG-basierte semantische Codesuche (Indizierung erforderlich) |

### Git Tools (6)

| Tool | Beschreibung |
|------|-------------|
| `git_status` | Arbeitsbaum-Status anzeigen (Porcelain-Format) |
| `git_diff` | Aenderungen zwischen Arbeitsbaum und Index anzeigen (staged/unstaged) |
| `git_log` | Commit-Verlauf anzeigen |
| `git_commit` | Dateien stagen und einen Commit erstellen |
| `git_branch` | Branches auflisten, erstellen, loeschen oder wechseln |
| `git_stash` | Nicht committete Aenderungen stashen oder wiederherstellen |

### .NET Build Tools (2)

| Tool | Beschreibung |
|------|-------------|
| `dotnet_build` | .NET-Projekt bauen und Fehler/Warnungen parsen |
| `dotnet_test` | .NET-Tests ausfuehren und Ergebniszusammenfassung parsen |

### Analyse-Tools (4)

| Tool | Beschreibung |
|------|-------------|
| `code_quality` | C#-Code auf Strada.Core Anti-Patterns und Best-Practice-Verstoesse analysieren |
| `csharp_parse` | C#-Quellcode in einen strukturierten AST mit Klassen, Structs, Methoden, Feldern, Namespaces parsen |
| `dependency_graph` | Unity-Projekt-Assembly-Referenzen und Namespace-Abhaengigkeiten analysieren, zirkulaere Abhaengigkeiten erkennen |
| `project_health` | Umfassender Projekt-Gesundheitscheck mit Code-Qualitaet, Abhaengigkeitsanalyse und Dateistatistiken |

### Unity Szenen- & Prefab-Tools (8)

| Tool | Beschreibung |
|------|-------------|
| `unity_scene_create` | Neue Unity-Szene erstellen |
| `unity_scene_open` | Vorhandene Szene im Editor oeffnen |
| `unity_scene_save` | Aktuelle Szene speichern |
| `unity_scene_info` | Szenen-Metadaten und Statistiken abrufen |
| `unity_scene_analyze` | Szenenhierarchie aus YAML analysieren (keine Bridge erforderlich) |
| `unity_prefab_create` | Neues Prefab aus einem GameObject erstellen |
| `unity_prefab_instantiate` | Prefab in der aktuellen Szene instanziieren |
| `unity_prefab_analyze` | Prefab-Struktur aus YAML analysieren (keine Bridge erforderlich) |

### Unity Asset-Tools (8)

| Tool | Beschreibung |
|------|-------------|
| `unity_asset_find` | Assets nach Name, Typ oder Label suchen |
| `unity_asset_dependencies` | Asset-Abhaengigkeitsketten analysieren |
| `unity_asset_unused` | Potenziell ungenutzte Assets im Projekt finden |
| `unity_material_get` | Material-Eigenschaften und Shader-Zuweisungen lesen |
| `unity_material_set` | Material-Eigenschaften aendern |
| `unity_shader_list` | Verfuegbare Shader mit Keywords und Eigenschaften auflisten |
| `unity_scriptableobject_create` | Neues ScriptableObject-Asset erstellen |
| `unity_texture_info` | Textur-Import-Einstellungen und Metadaten abrufen |

### Unity Subsystem-Tools (6)

| Tool | Beschreibung |
|------|-------------|
| `unity_animation_play` | Animator-Wiedergabe steuern |
| `unity_animation_list` | Animationsclips und Parameter auflisten |
| `unity_physics_raycast` | Physik-Raycasts in der Szene durchfuehren |
| `unity_navmesh_bake` | NavMesh-Einstellungen backen oder konfigurieren |
| `unity_particles_control` | Partikelsystem-Wiedergabe steuern |
| `unity_lighting_bake` | Beleuchtung backen und Lichteinstellungen konfigurieren |

### Unity Konfigurations-Tools (4)

| Tool | Beschreibung |
|------|-------------|
| `unity_player_settings` | Player-Einstellungen abrufen/setzen (Firma, Produkt, Plattform) |
| `unity_quality_settings` | Qualitaetsstufen und Grafikeinstellungen abrufen/setzen |
| `unity_build_settings` | Build-Ziele, Szenen und Optionen abrufen/setzen |
| `unity_project_settings` | Tags, Layer, Physik- und Eingabe-Einstellungen abrufen/setzen |

### Erweiterte Tools (5)

| Tool | Beschreibung |
|------|-------------|
| `batch_execute` | Mehrere Tools in einer einzigen Anfrage ausfuehren |
| `script_execute` | C#-Skripte ueber Roslyn ausfuehren (Opt-in, standardmaessig deaktiviert) |
| `script_validate` | C#-Skript-Syntax ohne Ausfuehrung validieren |
| `csharp_reflection` | Typen, Methoden und Assemblies per Reflection inspizieren |
| `unity_profiler` | Auf Unity Profiler-Daten und Leistungsmetriken zugreifen |

### RAG-basierte Codesuche

```
C# Source -> Tree-sitter AST -> Structural Chunks -> Gemini Embeddings -> HNSW Vector Index
```

- Semantische Codesuche ueber das gesamte Projekt
- Versteht Klassen-/Methoden-/Feld-Grenzen
- Inkrementelle Indizierung (nur geaenderte Dateien werden neu indiziert)
- Hybrides Reranking: Vektoraehnlichkeit + Schluesselwoerter + struktureller Kontext

### Unity Editor Bridge

Echtzeit-TCP-Verbindung zum Unity Editor (Port 7691):
- GameObjects erstellen, finden, aendern, loeschen
- Komponenten hinzufuegen/entfernen/lesen
- Transform-Manipulation (Position, Rotation, Skalierung, Reparenting)
- Play-Modus-Steuerung (Abspielen, Pausieren, Stoppen, Einzelschritt)
- Konsolenausgabe (Log, Warnung, Fehler, Leeren)
- Editor-Auswahl-Verwaltung
- Menuebefehl-Ausfuehrung

### Event-Streaming

Die Bridge sendet Unity Editor-Events in Echtzeit:
- `scene.changed` — Szene geoeffnet, geschlossen, gespeichert
- `console.line` — Neue Konsolenlog-Eintraege
- `compile.started` / `compile.finished` — Skript-Kompilierung
- `playmode.changed` — Abspielen/Pausieren/Stoppen-Uebergaenge
- `selection.changed` — Aenderungen der Objektauswahl

## Ressourcen (10)

| URI | Beschreibung | Quelle |
|-----|-------------|--------|
| `strada://api-reference` | Strada.Core API-Dokumentation | Dateibasiert |
| `strada://namespaces` | Strada.Core Namespace-Hierarchie | Dateibasiert |
| `strada://examples/{pattern}` | Code-Beispiele (ECS, MVCS, DI) | Dateibasiert |
| `unity://manifest` | Unity-Paketmanifest (Packages/manifest.json) | Dateibasiert |
| `unity://project-settings/{category}` | Unity-Projekteinstellungen nach Kategorie | Dateibasiert |
| `unity://assemblies` | Unity-Assembly-Definitionen (.asmdef-Dateien) | Dateibasiert |
| `unity://file-stats` | Unity-Projekt-Dateistatistiken | Dateibasiert |
| `unity://scene-hierarchy` | Aktive Szenenhierarchie | Bridge |
| `unity://console-logs` | Aktuelle Konsolenausgabe | Bridge |
| `unity://play-state` | Aktueller Play-Modus-Status | Bridge |

## Prompts (6)

| Prompt | Beschreibung |
|--------|-------------|
| `create_ecs_feature` | Mehrstufige Nachrichtensequenz zur Erstellung eines ECS-Features (Komponente, System, Modulregistrierung) |
| `create_mvcs_feature` | MVCS-Muster-Scaffolding-Anleitung fuer Strada.Core |
| `analyze_architecture` | Architektur-Review-Prompt fuer Strada.Core-Projekte |
| `debug_performance` | Anleitung zur Leistungs-Fehlerbehebung fuer Unity-Projekte |
| `optimize_build` | Build-Optimierungs-Checkliste fuer Unity-Projekte |
| `setup_scene` | Workflow-Anleitung fuer die Szenen-Einrichtung in Unity-Projekten |

## Installation

### Voraussetzungen

- Node.js >= 20
- Unity 2021.3+ (fuer Bridge-Funktionen)
- Ein Strada.Core-Projekt (fuer Framework-Tools — optional)

### npm (empfohlen)

```bash
npm install -g strada-mcp
```

### Aus dem Quellcode

```bash
git clone https://github.com/okandemirel/Strada.MCP.git
cd Strada.MCP
npm install
npm run build
```

### IDE-Konfiguration

#### Claude Desktop

Datei: `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) oder `%APPDATA%\Claude\claude_desktop_config.json` (Windows)

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

Datei: `.cursor/mcp.json` im Workspace-Stammverzeichnis:

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

Datei: `~/.windsurf/mcp.json`:

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

Datei: `~/.claude/settings.json` oder Projekt `.mcp.json`:

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

Datei: `.continue/config.json`:

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

## Unity-Paket-Einrichtung

### com.strada.mcp installieren

1. Oeffnen Sie Unity > Window > Package Manager
2. Klicken Sie auf "+" > "Add package from git URL..."
3. Geben Sie ein: `https://github.com/okandemirel/Strada.MCP.git?path=unity-package/com.strada.mcp`
4. Klicken Sie auf Add

### Konfiguration

Nach der Installation:
1. Gehen Sie zu **Strada > MCP > Settings**
2. Setzen Sie den Port (Standard: 7691)
3. Aktivieren/deaktivieren Sie den automatischen Start
4. Ueberpruefen Sie, ob die Verbindungsstatusanzeige gruen wird, wenn der MCP-Server verbunden ist

### Manuelle Steuerung

- **Strada > MCP > Start Server** — Bridge starten
- **Strada > MCP > Stop Server** — Bridge stoppen
- **Strada > MCP > Status** — Aktuellen Status protokollieren

## Konfiguration

Alle Optionen werden ueber Umgebungsvariablen konfiguriert:

| Variable | Beschreibung | Standard |
|----------|-------------|----------|
| `MCP_TRANSPORT` | Transportmodus: `stdio` oder `http` | `stdio` |
| `MCP_HTTP_PORT` | Streamable HTTP-Port | `3100` |
| `MCP_HTTP_HOST` | HTTP-Bind-Adresse | `127.0.0.1` |
| `UNITY_BRIDGE_PORT` | TCP-Port fuer Unity Editor Bridge | `7691` |
| `UNITY_BRIDGE_AUTO_CONNECT` | Automatisch bei Start mit Unity verbinden | `true` |
| `UNITY_BRIDGE_TIMEOUT` | Bridge-Verbindungs-Timeout (ms) | `5000` |
| `UNITY_PROJECT_PATH` | Pfad zum Unity-Projekt (automatische Erkennung wenn leer) | — |
| `EMBEDDING_PROVIDER` | Embedding-Anbieter: `gemini`, `openai`, `ollama` | `gemini` |
| `EMBEDDING_MODEL` | Embedding-Modellname | `gemini-embedding-2-preview` |
| `EMBEDDING_DIMENSIONS` | Embedding-Dimensionen (128-3072) | `768` |
| `EMBEDDING_API_KEY` | API-Schluessel fuer Embedding-Anbieter | — |
| `RAG_AUTO_INDEX` | Automatische Indizierung beim Start | `true` |
| `RAG_WATCH_FILES` | Dateiaenderungen ueberwachen | `false` |
| `BRAIN_URL` | Strada.Brain HTTP-URL (leer = deaktiviert) | — |
| `BRAIN_API_KEY` | Brain API-Schluessel | — |
| `ALLOWED_PATHS` | Kommagetrennte Liste erlaubter Stammverzeichnisse | — |
| `READ_ONLY` | Globaler Nur-Lesen-Modus | `false` |
| `SCRIPT_EXECUTE_ENABLED` | Roslyn-Skriptausfuehrung aktivieren | `false` |
| `REFLECTION_INVOKE_ENABLED` | C# Reflection-Methodenaufruf aktivieren | `false` |
| `MAX_FILE_SIZE` | Maximale Dateigroesse (Bytes) | `10485760` |
| `LOG_LEVEL` | Log-Stufe: `debug`, `info`, `warn`, `error` | `info` |
| `LOG_FILE` | Log-Dateipfad (stderr wenn leer) | — |

## Brain-Integration

Bei Verbindung mit Strada.Brain (konfiguriertes `BRAIN_URL`):

- **Gemeinsames Gedaechtnis**: Brains Langzeitgedaechtnis informiert Tool-Vorschlaege
- **Zusammengefuehrtes RAG**: Brain-Gedaechtniskontext + MCP Tree-sitter AST kombiniert
- **Lernen**: Tool-Nutzungsmuster fliessen in Brains Lern-Pipeline zurueck
- **Zielausfuehrung**: Brain kann MCP-Tools als Teil von Zielplaenen aufrufen

Ohne Brain arbeitet Strada.MCP als vollstaendig unabhaengiger MCP-Server.

## Sicherheit

| Schicht | Schutz |
|---------|--------|
| Eingabevalidierung | Zod-Schema + Typueberpruefung fuer alle Tools |
| Pfadschutz | Verzeichnis-Traversal-Schutz, Null-Byte-Ablehnung, Symlink-Traversal-Schutz |
| Nur-Lesen-Modus | Globale + pro-Tool Schreibberechtigungsdurchsetzung |
| Credential-Bereinigung | API-Schluessel-/Token-Muster-Bereinigung in allen Ausgaben |
| Tool-Whitelist | Unity Bridge akzeptiert nur registrierte JSON-RPC-Befehle |
| Ratenbegrenzung | Embedding-API-Ratenbegrenzungsschutz |
| Nur Localhost | Unity Bridge bindet nur an 127.0.0.1 |
| Skriptausfuehrung | Roslyn-Ausfuehrung standardmaessig deaktiviert, explizites Opt-in |

Vollstaendige Details finden Sie in [SECURITY.md](../SECURITY.md).

## Entwicklung

### Aus dem Quellcode bauen

```bash
git clone https://github.com/okandemirel/Strada.MCP.git
cd Strada.MCP
npm install
npm run build
```

### Tests ausfuehren

```bash
npm test              # Alle Tests ausfuehren
npm run test:watch    # Watch-Modus
npm run typecheck     # TypeScript-Typueberpruefung
```

### Entwicklungsmodus

```bash
npm run dev           # Mit tsx ausfuehren (Auto-Reload)
```

### Projektstruktur

```
src/
  config/          - Zod-validierte Konfiguration
  security/        - Pfadschutz, Bereiniger, Validator
  tools/
    strada/        - 10 Strada Framework-Tools
    unity/         - 18 bridge-abhaengige Unity-Tools
    file/          - 6 Dateioperations-Tools
    search/        - 3 Such-Tools (Glob, Grep, RAG)
    git/           - 6 Git-Tools
    dotnet/        - 2 .NET Build-Tools
    analysis/      - 4 Code-Analyse-Tools
  intelligence/
    parser/        - Tree-sitter C#-Parser
    rag/           - Embedding, Chunker, HNSW-Index
  bridge/          - Unity TCP Bridge-Client
  context/         - Brain HTTP-Client
  resources/       - 10 MCP-Ressourcen
  prompts/         - 6 MCP-Prompts
  utils/           - Logger, Prozess-Runner

unity-package/
  com.strada.mcp/  - C# Unity Editor-Paket (UPM)
```

## Mitwirken

Siehe [CONTRIBUTING.md](../CONTRIBUTING.md) fuer Entwicklungseinrichtung, Code-Standards und PR-Richtlinien.

## Lizenz

MIT-Lizenz. Siehe [LICENSE](../LICENSE) fuer Details.
