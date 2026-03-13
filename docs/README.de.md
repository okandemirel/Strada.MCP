<div align="center">
  <h1>Strada.MCP</h1>
  <p><strong>Der umfassendste framework-bewusste Unity MCP-Server</strong></p>
  <p>49 Werkzeuge, 10 Ressourcen, 6 Prompts — mit Strada.Core-Intelligenz, RAG-Suche und Unity Editor-Bridge</p>

  <p>
    <a href="https://github.com/okandemirel/Strada.MCP/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="Lizenz: MIT"></a>
    <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg" alt="Node.js >= 20"></a>
    <a href="https://www.typescriptlang.org"><img src="https://img.shields.io/badge/TypeScript-5.x-blue.svg" alt="TypeScript 5.x"></a>
    <a href="https://modelcontextprotocol.io"><img src="https://img.shields.io/badge/MCP-kompatibel-purple.svg" alt="MCP-kompatibel"></a>
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

Strada.MCP ist ein Model Context Protocol (MCP) Server, der speziell fuer Unity- und Strada.Core-Entwicklung konzipiert wurde. Er verbindet KI-Assistenten (Claude, GPT usw.) direkt mit Ihrem Unity-Workflow.

**Duale Benutzerarchitektur:**
- **Standalone-Modus** — Funktioniert sofort mit Claude Desktop, Cursor, Windsurf, VS Code + Continue
- **Brain-Modus** — Integration mit Strada.Brain fuer erweitertes Gedaechtnis, Lernen und Zielausfuehrung

**Warum Strada.MCP?**
- **Framework-bewusst**: Der einzige Unity MCP-Server, der Strada.Core-Muster (ECS, MVCS, DI, Module) versteht
- **Umfassendes Toolset**: 49 Werkzeuge fuer Dateien, Git, .NET, Codeanalyse, Strada-Geruesterstellung und Unity-Laufzeitoperationen
- **RAG-Suche**: Tree-sitter C#-Parsing + Gemini-Embeddings + HNSW-Vektorsuche
- **Echtzeit-Bridge**: TCP-Bridge zum Unity Editor fuer Live-Szenenmanipulation, Komponentenbearbeitung und Wiedergabemodus-Steuerung
- **Sicherheit zuerst**: Pfadtraversal-Schutz, Anmeldedaten-Bereinigung, Nur-Lese-Modus, Skriptausfuehrung per Opt-in

## Schnellstart

### 1. Installation

```bash
npm install -g strada-mcp
```

Oder aus dem Quellcode bauen:

```bash
git clone https://github.com/okandemirel/Strada.MCP.git
cd Strada.MCP
npm install
npm run build
```

### 2. IDE konfigurieren

**Claude Desktop** — Zu `~/Library/Application Support/Claude/claude_desktop_config.json` hinzufuegen:

```json
{
  "mcpServers": {
    "strada-mcp": {
      "command": "strada-mcp",
      "env": {
        "UNITY_PROJECT_PATH": "/pfad/zum/projekt"
      }
    }
  }
}
```

**Cursor** — Zu `.cursor/mcp.json` hinzufuegen:

```json
{
  "mcpServers": {
    "strada-mcp": {
      "command": "strada-mcp",
      "env": {
        "UNITY_PROJECT_PATH": "/pfad/zum/projekt"
      }
    }
  }
}
```

### 3. Unity-Paket installieren (optional — fuer vollen Werkzeugzugang)

Unity Package Manager > "+" > Paket von Git-URL hinzufuegen:

```
https://github.com/okandemirel/Strada.MCP.git?path=unity-package/com.strada.mcp
```

### 4. Loslegen

Bitten Sie Ihren KI-Assistenten, mit Ihrem Unity-Projekt zu arbeiten:
- "Erstelle eine ECS Health-Komponente mit Current- und Max-Feldern"
- "Finde alle GameObjects mit einer Rigidbody-Komponente"
- "Analysiere die Projektarchitektur auf Anti-Patterns"
- "Durchsuche die Codebasis nach Schadensberechnungslogik"

## Funktionen

### Werkzeugkategorien (49 insgesamt)

| Kategorie | Anzahl | Unity-Bridge erforderlich |
|-----------|--------|---------------------------|
| Strada Framework | 10 | Nein |
| Unity-Laufzeit | 18 | Ja |
| Dateioperationen | 6 | Nein |
| Suche | 3 | Nein |
| Git | 6 | Nein |
| .NET-Build | 2 | Nein |
| Analyse | 4 | Nein |

- **Unity geschlossen**: 31 Werkzeuge verfuegbar (Dateien, Git, Suche, Analyse, Strada-Geruesterstellung, .NET)
- **Unity geoeffnet**: Alle 49 Werkzeuge ueber die Bridge aktiv

### Strada Framework-Werkzeuge

Diese Werkzeuge sind einzigartig fuer Strada.MCP — kein Wettbewerber bietet framework-bewusste Geruesterstellung.

| Werkzeug | Beschreibung |
|----------|-------------|
| `strada_create_component` | Generiert eine ECS-Komponentenstruktur mit IComponent-Implementierung und StructLayout |
| `strada_create_system` | Generiert ein Strada ECS-System (SystemBase, JobSystemBase oder BurstSystemBase) |
| `strada_create_module` | Generiert ein Strada-Modul mit ModuleConfig, Assembly-Definition und Ordnerstruktur |
| `strada_create_mediator` | Generiert einen EntityMediator, der ECS-Komponenten an eine Unity View bindet |
| `strada_create_service` | Generiert einen Strada-Service (Service, TickableService, FixedTickableService, OrderedService) |
| `strada_create_controller` | Generiert einen Strada Controller mit typisierter Modellreferenz und View-Injektion |
| `strada_create_model` | Generiert ein Strada Model oder ReactiveModel mit typisierten Eigenschaften |
| `strada_analyze_project` | Scannt .cs-Dateien, um Module, Systeme, Komponenten, Services und DI-Nutzung abzubilden |
| `strada_validate_architecture` | Validiert Strada.Core-Namenskonventionen, Lebenszyklus- und Abhaengigkeitsregeln |
| `strada_scaffold_feature` | Generiert ein vollstaendiges Feature-Skelett: Modul + Komponenten + Systeme + optionale MVCS-Views |

### Unity-Laufzeitwerkzeuge (18)

| Werkzeug | Beschreibung |
|----------|-------------|
| `unity_create_gameobject` | Erstellt ein neues GameObject (leer, Primitiv oder aus Prefab) |
| `unity_find_gameobjects` | Findet GameObjects nach Name, Tag, Layer oder Komponententyp |
| `unity_modify_gameobject` | Aendert GameObject-Eigenschaften (Name, Aktiv, Tag, Layer, Statisch) |
| `unity_delete_gameobject` | Loescht ein GameObject aus der Szene nach Instanz-ID |
| `unity_duplicate_gameobject` | Dupliziert ein GameObject mit optionalem neuen Namen, Parent oder Offset |
| `unity_add_component` | Fuegt einem GameObject eine Komponente nach Typnamen hinzu |
| `unity_remove_component` | Entfernt eine Komponente von einem GameObject nach Typnamen |
| `unity_get_components` | Listet alle an ein GameObject angehaengten Komponenten |
| `unity_set_transform` | Setzt Position, Rotation und/oder Skalierung eines GameObject-Transforms |
| `unity_get_transform` | Ruft den aktuellen Transform eines GameObjects ab (Position, Rotation, Skalierung) |
| `unity_set_parent` | Verschiebt ein GameObject unter einen neuen Parent-Transform |
| `unity_play` | Steuert den Unity-Wiedergabemodus (Abspielen, Pausieren, Stoppen, Einzelbild) |
| `unity_get_play_state` | Ruft den aktuellen Wiedergabestatus des Unity Editors ab |
| `unity_execute_menu` | Fuehrt einen Unity Editor-Menubefehl nach Pfad aus |
| `unity_console_log` | Schreibt eine Nachricht in die Unity-Konsole (Log, Warnung oder Fehler) |
| `unity_console_clear` | Leert die Unity Editor-Konsole |
| `unity_selection_get` | Ruft die aktuell ausgewaehlten Objekte im Unity Editor ab |
| `unity_selection_set` | Setzt die Editor-Auswahl auf die angegebenen Instanz-IDs |

### Datei- und Suchwerkzeuge (9)

| Werkzeug | Beschreibung |
|----------|-------------|
| `file_read` | Liest Dateiinhalte mit Zeilennummern, optionalem Offset/Limit |
| `file_write` | Schreibt Inhalte in eine Datei, erstellt Verzeichnisse bei Bedarf |
| `file_edit` | Ersetzt Text in einer Datei mittels exakter Zeichenkettenabgleichung |
| `file_delete` | Loescht eine Datei |
| `file_rename` | Benennt eine Datei um oder verschiebt sie |
| `list_directory` | Listet Verzeichnisinhalte mit Datei-/Verzeichnisanzeige |
| `glob_search` | Sucht nach Dateien, die einem Glob-Muster entsprechen |
| `grep_search` | Durchsucht Dateiinhalte mit Regex, optionale Kontextzeilen |
| `code_search` | RAG-basierte semantische Codesuche (erfordert Indexierung) |

### Git-Werkzeuge (6)

| Werkzeug | Beschreibung |
|----------|-------------|
| `git_status` | Zeigt den Arbeitsbaum-Status (Porcelain-Format) |
| `git_diff` | Zeigt Aenderungen zwischen Arbeitsbaum und Index |
| `git_log` | Zeigt die Commit-Historie |
| `git_commit` | Stellt Dateien bereit und erstellt einen Commit |
| `git_branch` | Listet, erstellt, loescht oder wechselt Branches |
| `git_stash` | Speichert oder stellt nicht committete Aenderungen wieder her |

### .NET-Build-Werkzeuge (2)

| Werkzeug | Beschreibung |
|----------|-------------|
| `dotnet_build` | Baut ein .NET-Projekt und parst Fehler/Warnungen |
| `dotnet_test` | Fuehrt .NET-Tests aus und parst die Ergebniszusammenfassung |

### Analysewerkzeuge (4)

| Werkzeug | Beschreibung |
|----------|-------------|
| `code_quality` | Analysiert C#-Code auf Strada.Core Anti-Patterns und Best-Practice-Verstoesse |
| `csharp_parse` | Parst C#-Quellcode in einen strukturierten AST mit Klassen, Structs, Methoden, Feldern, Namespaces |
| `dependency_graph` | Analysiert Unity-Projekt-Assembly-Referenzen und Namespace-Abhaengigkeiten, erkennt zirkulaere Abhaengigkeiten |
| `project_health` | Umfassender Projekt-Gesundheitscheck, kombiniert Codequalitaet, Abhaengigkeitsanalyse und Dateistatistiken |

### RAG-Codesuche

```
C#-Quelle -> Tree-sitter AST -> Strukturelle Chunks -> Gemini-Embeddings -> HNSW-Vektorindex
```

- Semantische Codesuche ueber das gesamte Projekt
- Versteht Klassen-/Methoden-/Feldgrenzen
- Inkrementelle Indexierung (nur geaenderte Dateien werden neu indexiert)
- Hybrid-Reranking: Vektoraehnlichkeit + Schluesselwort + struktureller Kontext

### Unity Editor-Bridge

Echtzeit-TCP-Verbindung zum Unity Editor (Port 7691):
- GameObjects erstellen, finden, aendern, loeschen
- Komponenten hinzufuegen/entfernen/lesen
- Transform-Manipulation (Position, Rotation, Skalierung, Umgruppierung)
- Wiedergabemodus-Steuerung (Abspielen, Pausieren, Stoppen, Schritt)
- Konsolenausgabe (Log, Warnung, Fehler, Loeschen)
- Editor-Auswahl-Verwaltung
- Menubefehl-Ausfuehrung

## Ressourcen (10)

| URI | Beschreibung | Quelle |
|-----|-------------|--------|
| `strada://api-reference` | Strada.Core API-Dokumentation | Dateibasiert |
| `strada://namespaces` | Strada.Core Namespace-Hierarchie | Dateibasiert |
| `strada://examples/{pattern}` | Codebeispiele (ECS, MVCS, DI) | Dateibasiert |
| `unity://manifest` | Unity-Paketmanifest | Dateibasiert |
| `unity://project-settings/{category}` | Unity-Projekteinstellungen nach Kategorie | Dateibasiert |
| `unity://assemblies` | Unity Assembly-Definitionen | Dateibasiert |
| `unity://file-stats` | Unity-Projekt-Dateistatistiken | Dateibasiert |
| `unity://scene-hierarchy` | Aktive Szenenhierarchie | Bridge |
| `unity://console-logs` | Aktuelle Konsolenausgabe | Bridge |
| `unity://play-state` | Aktueller Wiedergabemodus-Status | Bridge |

## Prompts (6)

| Prompt | Beschreibung |
|--------|-------------|
| `create_ecs_feature` | Leitfaden zur ECS-Feature-Erstellung (Komponente, System, Modulregistrierung) |
| `create_mvcs_feature` | MVCS-Muster-Geruesterstellungsleitfaden fuer Strada.Core |
| `analyze_architecture` | Architektur-Review-Prompt fuer Strada.Core-Projekte |
| `debug_performance` | Leitfaden zur Performance-Fehlersuche fuer Unity-Projekte |
| `optimize_build` | Build-Optimierungs-Checkliste fuer Unity-Projekte |
| `setup_scene` | Szenen-Setup-Workflow-Leitfaden fuer Unity-Projekte |

## Konfiguration

Alle Optionen werden ueber Umgebungsvariablen konfiguriert:

| Variable | Beschreibung | Standard |
|----------|-------------|----------|
| `MCP_TRANSPORT` | Transportmodus: `stdio` oder `http` | `stdio` |
| `MCP_HTTP_PORT` | Streamable HTTP-Port | `3100` |
| `MCP_HTTP_HOST` | HTTP-Bind-Adresse | `127.0.0.1` |
| `UNITY_BRIDGE_PORT` | TCP-Port fuer Unity Editor-Bridge | `7691` |
| `UNITY_BRIDGE_AUTO_CONNECT` | Automatische Verbindung zu Unity beim Start | `true` |
| `UNITY_BRIDGE_TIMEOUT` | Bridge-Verbindungs-Timeout (ms) | `5000` |
| `UNITY_PROJECT_PATH` | Pfad zum Unity-Projekt (automatische Erkennung wenn leer) | — |
| `EMBEDDING_PROVIDER` | Embedding-Anbieter: `gemini`, `openai`, `ollama` | `gemini` |
| `EMBEDDING_MODEL` | Embedding-Modellname | `gemini-embedding-2-preview` |
| `EMBEDDING_DIMENSIONS` | Embedding-Dimensionen (128-3072) | `768` |
| `EMBEDDING_API_KEY` | API-Schluessel fuer Embedding-Anbieter | — |
| `RAG_AUTO_INDEX` | Automatische Indexierung beim Start | `true` |
| `RAG_WATCH_FILES` | Dateiaenderungen ueberwachen | `false` |
| `BRAIN_URL` | Strada.Brain HTTP-URL (leer = deaktiviert) | — |
| `BRAIN_API_KEY` | Brain API-Schluessel | — |
| `READ_ONLY` | Globaler Nur-Lese-Modus | `false` |
| `SCRIPT_EXECUTE_ENABLED` | Roslyn-Skriptausfuehrung aktivieren | `false` |
| `MAX_FILE_SIZE` | Maximale Dateigroesse (Bytes) | `10485760` |
| `LOG_LEVEL` | Log-Level: `debug`, `info`, `warn`, `error` | `info` |
| `LOG_FILE` | Log-Dateipfad (stderr wenn leer) | — |

## Brain-Integration

Bei Verbindung mit Strada.Brain (`BRAIN_URL` konfiguriert):

- **Geteilter Speicher**: Brains Langzeitgedaechtnis informiert Werkzeugvorschlaege
- **Vereinigtes RAG**: Brain-Speicherkontext + MCP Tree-sitter AST kombiniert
- **Lernen**: Werkzeugnutzungsmuster fliessen zurueck in Brains Lernpipeline
- **Zielausfuehrung**: Brain kann MCP-Werkzeuge als Teil von Zielplaenen aufrufen

Ohne Brain arbeitet Strada.MCP als vollstaendig unabhaengiger MCP-Server.

## Sicherheit

| Ebene | Schutz |
|-------|--------|
| Eingabevalidierung | Zod-Schema + Typueberpruefung fuer alle Werkzeuge |
| Pfadschutz | Verzeichnistraversal-Schutz, Null-Byte-Ablehnung, Symlink-Traversal-Schutz |
| Nur-Lese-Modus | Globale + werkzeugspezifische Schreibrechtsdurchsetzung |
| Anmeldedaten-Bereinigung | API-Schluessel-/Token-Muster-Bereinigung in allen Ausgaben |
| Werkzeug-Whitelist | Unity-Bridge akzeptiert nur registrierte JSON-RPC-Befehle |
| Ratenbegrenzung | Embedding-API-Ratenbegrenzungsschutz |
| Nur Localhost | Unity-Bridge bindet nur an 127.0.0.1 |
| Skriptausfuehrung | Roslyn-Ausfuehrung standardmaessig deaktiviert, explizites Opt-in erforderlich |

Weitere Details finden Sie in [SECURITY.md](../SECURITY.md).

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
npm run test:watch    # Ueberwachungsmodus
npm run typecheck     # TypeScript-Typueberpruefung
```

### Entwicklungsmodus

```bash
npm run dev           # Mit tsx ausfuehren (automatisches Neuladen)
```

## Beitragen

Entwicklungssetup, Codestandards und PR-Richtlinien finden Sie in [CONTRIBUTING.md](../CONTRIBUTING.md).

## Lizenz

MIT-Lizenz. Details finden Sie in [LICENSE](../LICENSE).
