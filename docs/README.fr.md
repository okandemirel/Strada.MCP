<div align="center">
  <h1>Strada.MCP</h1>
  <p><strong>Le serveur MCP Unity le plus complet et conscient du framework</strong></p>
  <p>76 outils, 10 ressources, 6 prompts — avec l'intelligence Strada.Core, la recherche alimentee par RAG et le pont vers l'Unity Editor</p>

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

## Vue d'ensemble

Strada.MCP est un serveur Model Context Protocol (MCP) specialement concu pour le developpement Unity et Strada.Core. Il connecte les assistants IA (Claude, GPT, etc.) directement a votre flux de travail Unity.

**Architecture a double usage :**
- **Mode autonome** — Fonctionne immediatement avec Claude Desktop, Cursor, Windsurf, VS Code + Continue
- **Mode Brain** — S'integre a Strada.Brain pour une memoire amelioree, l'apprentissage et l'execution d'objectifs

**Pourquoi Strada.MCP ?**
- **Conscient du framework** : Le seul serveur MCP Unity qui comprend les patterns Strada.Core (ECS, MVCS, DI, modules)
- **Ensemble d'outils complet** : 76 outils couvrant les fichiers, git, .NET, l'analyse de code, le scaffolding Strada, le runtime Unity, les scenes/prefabs, les assets, les sous-systemes et la configuration de projet
- **Recherche alimentee par RAG** : Analyse C# par Tree-sitter + embeddings Gemini + recherche vectorielle HNSW
- **Pont en temps reel** : Connexion TCP a l'Unity Editor pour la manipulation de scenes en direct, l'edition de composants et le controle du mode de jeu
- **Securite d'abord** : Prevention de traversee de chemin, nettoyage des identifiants, mode lecture seule, execution de scripts sur opt-in

## Demarrage rapide

### 1. Installation

```bash
npm install -g strada-mcp
```

Ou cloner et compiler :

```bash
git clone https://github.com/okandemirel/Strada.MCP.git
cd Strada.MCP
npm install
npm run build
```

### 2. Configurer votre IDE

**Claude Desktop** — Ajouter a `~/Library/Application Support/Claude/claude_desktop_config.json` :

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

**Cursor** — Ajouter a `.cursor/mcp.json` :

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

### 3. Installer le package Unity (optionnel — pour un acces complet aux outils)

Ouvrez le Unity Package Manager > "+" > Ajouter un package depuis une URL git :

```
https://github.com/okandemirel/Strada.MCP.git?path=unity-package/com.strada.mcp
```

### 4. Commencer a utiliser

Demandez a votre assistant IA de travailler avec votre projet Unity :
- "Cree un composant ECS Health avec les champs Current et Max"
- "Trouve tous les GameObjects avec le composant Rigidbody"
- "Analyse l'architecture du projet pour detecter les anti-patterns"
- "Recherche dans le code la logique de calcul des degats"

## Fonctionnalites

### Categories d'outils (76 au total)

| Categorie | Nombre | Necessite Unity Bridge |
|-----------|--------|------------------------|
| Strada Framework | 10 | Non |
| Unity Runtime | 18 | Oui |
| Unity Scene/Prefab | 8 | Mixte |
| Unity Asset | 8 | Mixte |
| Unity Sous-systeme | 6 | Oui |
| Unity Configuration | 4 | Oui |
| Avance | 5 | Mixte |
| Operations de fichiers | 6 | Non |
| Recherche | 3 | Non |
| Git | 6 | Non |
| .NET Build | 2 | Non |
| Analyse | 4 | Non |

- **Unity ferme** : 35+ outils disponibles (fichiers, git, recherche, analyse, scaffolding Strada, .NET, analyse de scenes/prefabs)
- **Unity ouvert** : Les 76 outils sont actifs via le pont

### Outils du framework Strada

Ces outils sont uniques a Strada.MCP — aucun concurrent ne propose de scaffolding conscient du framework.

| Outil | Description |
|-------|-------------|
| `strada_create_component` | Generer une structure de composant ECS implementant IComponent avec StructLayout |
| `strada_create_system` | Generer un systeme ECS Strada (SystemBase, JobSystemBase ou BurstSystemBase) |
| `strada_create_module` | Generer un module Strada avec ModuleConfig, definition d'assembly et structure de dossiers |
| `strada_create_mediator` | Generer un EntityMediator liant les composants ECS a une Vue Unity |
| `strada_create_service` | Generer un service Strada (Service, TickableService, FixedTickableService ou OrderedService) |
| `strada_create_controller` | Generer un Controller Strada avec reference de modele typee et injection de vue |
| `strada_create_model` | Generer un Model ou ReactiveModel Strada avec des proprietes typees |
| `strada_analyze_project` | Scanner les fichiers .cs pour cartographier les modules, systemes, composants, services et l'utilisation de DI |
| `strada_validate_architecture` | Valider les conventions de nommage, les regles de cycle de vie et les regles de dependance de Strada.Core |
| `strada_scaffold_feature` | Generer un squelette de fonctionnalite complet : module + composants + systemes + vues MVCS optionnelles |

### Outils Unity Runtime (18)

| Outil | Description |
|-------|-------------|
| `unity_create_gameobject` | Creer un nouveau GameObject (vide, primitif ou depuis un prefab) |
| `unity_find_gameobjects` | Trouver des GameObjects par nom, tag, couche ou type de composant |
| `unity_modify_gameobject` | Modifier les proprietes d'un GameObject (nom, actif, tag, couche, statique) |
| `unity_delete_gameobject` | Supprimer un GameObject de la scene par ID d'instance |
| `unity_duplicate_gameobject` | Dupliquer un GameObject avec nom, parent ou decalage optionnels |
| `unity_add_component` | Ajouter un composant a un GameObject par nom de type |
| `unity_remove_component` | Supprimer un composant d'un GameObject par nom de type |
| `unity_get_components` | Lister tous les composants attaches a un GameObject |
| `unity_set_transform` | Definir la position, rotation et/ou l'echelle du Transform d'un GameObject |
| `unity_get_transform` | Obtenir le Transform actuel (position, rotation, echelle) d'un GameObject |
| `unity_set_parent` | Reparenter un GameObject sous un nouveau Transform parent |
| `unity_play` | Controler le mode de jeu Unity (lire, pause, arreter ou avancer d'une image) |
| `unity_get_play_state` | Obtenir l'etat actuel du mode de jeu de l'editeur Unity |
| `unity_execute_menu` | Executer une commande de menu de l'editeur Unity par chemin |
| `unity_console_log` | Ecrire un message dans la console Unity (log, avertissement ou erreur) |
| `unity_console_clear` | Effacer la console de l'editeur Unity |
| `unity_selection_get` | Obtenir les objets actuellement selectionnes dans l'editeur Unity |
| `unity_selection_set` | Definir la selection de l'editeur aux IDs d'instance specifies |

### Outils de fichiers et recherche (9)

| Outil | Description |
|-------|-------------|
| `file_read` | Lire le contenu d'un fichier avec numeros de ligne, offset/limite optionnels |
| `file_write` | Ecrire du contenu dans un fichier, en creant les repertoires si necessaire |
| `file_edit` | Remplacer du texte dans un fichier par correspondance exacte de chaine |
| `file_delete` | Supprimer un fichier |
| `file_rename` | Renommer ou deplacer un fichier |
| `list_directory` | Lister le contenu d'un repertoire avec indicateurs fichier/repertoire |
| `glob_search` | Rechercher des fichiers correspondant a un pattern glob |
| `grep_search` | Rechercher dans le contenu des fichiers avec regex et lignes de contexte optionnelles |
| `code_search` | Recherche semantique de code alimentee par RAG (necessite l'indexation) |

### Outils Git (6)

| Outil | Description |
|-------|-------------|
| `git_status` | Afficher l'etat de l'arbre de travail (format porcelain) |
| `git_diff` | Afficher les modifications entre l'arbre de travail et l'index (staged/unstaged) |
| `git_log` | Afficher l'historique des commits |
| `git_commit` | Indexer les fichiers et creer un commit |
| `git_branch` | Lister, creer, supprimer ou changer de branche |
| `git_stash` | Stocker ou restaurer les modifications non commitees |

### Outils de build .NET (2)

| Outil | Description |
|-------|-------------|
| `dotnet_build` | Compiler un projet .NET et analyser les erreurs/avertissements |
| `dotnet_test` | Executer les tests .NET et analyser le resume des resultats |

### Outils d'analyse (4)

| Outil | Description |
|-------|-------------|
| `code_quality` | Analyser le code C# pour detecter les anti-patterns Strada.Core et les violations de bonnes pratiques |
| `csharp_parse` | Analyser le code source C# en un AST structure avec classes, structs, methodes, champs, namespaces |
| `dependency_graph` | Analyser les references d'assembly et les dependances de namespace du projet Unity, detecter les dependances circulaires |
| `project_health` | Verification complete de la sante du projet combinant qualite du code, analyse des dependances et statistiques de fichiers |

### Outils de scene et prefab Unity (8)

| Outil | Description |
|-------|-------------|
| `unity_scene_create` | Creer une nouvelle scene Unity |
| `unity_scene_open` | Ouvrir une scene existante dans l'editeur |
| `unity_scene_save` | Sauvegarder la scene actuelle |
| `unity_scene_info` | Obtenir les metadonnees et statistiques de la scene |
| `unity_scene_analyze` | Analyser la hierarchie de la scene depuis le YAML (aucun pont requis) |
| `unity_prefab_create` | Creer un nouveau prefab a partir d'un GameObject |
| `unity_prefab_instantiate` | Instancier un prefab dans la scene actuelle |
| `unity_prefab_analyze` | Analyser la structure du prefab depuis le YAML (aucun pont requis) |

### Outils d'assets Unity (8)

| Outil | Description |
|-------|-------------|
| `unity_asset_find` | Rechercher des assets par nom, type ou label |
| `unity_asset_dependencies` | Analyser les chaines de dependances des assets |
| `unity_asset_unused` | Trouver les assets potentiellement inutilises dans le projet |
| `unity_material_get` | Lire les proprietes des materiaux et les assignations de shaders |
| `unity_material_set` | Modifier les proprietes des materiaux |
| `unity_shader_list` | Lister les shaders disponibles avec keywords et proprietes |
| `unity_scriptableobject_create` | Creer un nouvel asset ScriptableObject |
| `unity_texture_info` | Obtenir les parametres d'importation de texture et les metadonnees |

### Outils de sous-systemes Unity (6)

| Outil | Description |
|-------|-------------|
| `unity_animation_play` | Controler la lecture de l'animator |
| `unity_animation_list` | Lister les clips d'animation et les parametres |
| `unity_physics_raycast` | Effectuer des raycasts physiques dans la scene |
| `unity_navmesh_bake` | Precalculer ou configurer les parametres NavMesh |
| `unity_particles_control` | Controler la lecture du systeme de particules |
| `unity_lighting_bake` | Precalculer l'eclairage et configurer les parametres de lumiere |

### Outils de configuration Unity (4)

| Outil | Description |
|-------|-------------|
| `unity_player_settings` | Obtenir/definir les parametres du lecteur (entreprise, produit, plateforme) |
| `unity_quality_settings` | Obtenir/definir les niveaux de qualite et parametres graphiques |
| `unity_build_settings` | Obtenir/definir les cibles de build, scenes et options |
| `unity_project_settings` | Obtenir/definir les tags, couches, physique et parametres d'entree |

### Outils avances (5)

| Outil | Description |
|-------|-------------|
| `batch_execute` | Executer plusieurs outils en une seule requete |
| `script_execute` | Executer des scripts C# via Roslyn (opt-in, desactive par defaut) |
| `script_validate` | Valider la syntaxe d'un script C# sans l'executer |
| `csharp_reflection` | Inspecter les types, methodes et assemblies par reflexion |
| `unity_profiler` | Acceder aux donnees du profileur Unity et aux metriques de performance |

### Recherche de code alimentee par RAG

```
C# Source -> Tree-sitter AST -> Structural Chunks -> Gemini Embeddings -> HNSW Vector Index
```

- Recherche semantique de code sur l'ensemble du projet
- Comprend les limites des classes/methodes/champs
- Indexation incrementale (seuls les fichiers modifies sont reindexes)
- Reordonnancement hybride : similarite vectorielle + mots-cles + contexte structurel

### Pont vers l'Unity Editor

Connexion TCP en temps reel a l'Unity Editor (port 7691) :
- Creer, trouver, modifier, supprimer des GameObjects
- Ajouter/supprimer/lire des composants
- Manipulation du Transform (position, rotation, echelle, reparentage)
- Controle du mode de jeu (lire, pause, arreter, avancer pas a pas)
- Sortie console (log, avertissement, erreur, effacer)
- Gestion de la selection de l'editeur
- Execution de commandes de menu

### Diffusion d'evenements

Le pont diffuse les evenements de l'Unity Editor en temps reel :
- `scene.changed` — Scene ouverte, fermee, sauvegardee
- `console.line` — Nouvelles entrees de log dans la console
- `compile.started` / `compile.finished` — Compilation des scripts
- `playmode.changed` — Transitions lecture/pause/arret
- `selection.changed` — Changements de selection d'objets

## Ressources (10)

| URI | Description | Source |
|-----|-------------|--------|
| `strada://api-reference` | Documentation de l'API Strada.Core | Basee sur fichier |
| `strada://namespaces` | Hierarchie des namespaces Strada.Core | Basee sur fichier |
| `strada://examples/{pattern}` | Exemples de code (ECS, MVCS, DI) | Bases sur fichier |
| `unity://manifest` | Manifeste des packages Unity (Packages/manifest.json) | Base sur fichier |
| `unity://project-settings/{category}` | Parametres du projet Unity par categorie | Bases sur fichier |
| `unity://assemblies` | Definitions d'assembly Unity (fichiers .asmdef) | Basees sur fichier |
| `unity://file-stats` | Statistiques des fichiers du projet Unity | Basees sur fichier |
| `unity://scene-hierarchy` | Hierarchie de la scene active | Pont |
| `unity://console-logs` | Sortie recente de la console | Pont |
| `unity://play-state` | Etat actuel du mode de jeu | Pont |

## Prompts (6)

| Prompt | Description |
|--------|-------------|
| `create_ecs_feature` | Sequence multi-messages guidant la creation de fonctionnalites ECS (composant, systeme, enregistrement de module) |
| `create_mvcs_feature` | Guide de scaffolding du pattern MVCS pour Strada.Core |
| `analyze_architecture` | Prompt de revue d'architecture pour les projets Strada.Core |
| `debug_performance` | Guide de debogage de performance pour les projets Unity |
| `optimize_build` | Liste de verification d'optimisation de build pour les projets Unity |
| `setup_scene` | Guide de workflow pour la mise en place de scenes dans les projets Unity |

## Installation

### Prerequis

- Node.js >= 20
- Unity 2021.3+ (pour les fonctionnalites du pont)
- Un projet Strada.Core (pour les outils du framework — optionnel)

### npm (recommande)

```bash
npm install -g strada-mcp
```

### Depuis le code source

```bash
git clone https://github.com/okandemirel/Strada.MCP.git
cd Strada.MCP
npm install
npm run build
```

### Configuration de l'IDE

#### Claude Desktop

Fichier : `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) ou `%APPDATA%\Claude\claude_desktop_config.json` (Windows)

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

Fichier : `.cursor/mcp.json` a la racine du workspace :

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

Fichier : `~/.windsurf/mcp.json` :

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

Fichier : `~/.claude/settings.json` ou `.mcp.json` du projet :

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

Fichier : `.continue/config.json` :

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

## Configuration du package Unity

### Installer com.strada.mcp

1. Ouvrez Unity > Window > Package Manager
2. Cliquez sur "+" > "Add package from git URL..."
3. Entrez : `https://github.com/okandemirel/Strada.MCP.git?path=unity-package/com.strada.mcp`
4. Cliquez sur Add

### Configuration

Apres l'installation :
1. Allez dans **Strada > MCP > Settings**
2. Definissez le port (par defaut : 7691)
3. Activez/desactivez le demarrage automatique
4. Verifiez que l'indicateur d'etat de connexion passe au vert lorsque le serveur MCP se connecte

### Controle manuel

- **Strada > MCP > Start Server** — Demarrer le pont
- **Strada > MCP > Stop Server** — Arreter le pont
- **Strada > MCP > Status** — Enregistrer l'etat actuel

## Configuration

Toutes les options sont configurees via des variables d'environnement :

| Variable | Description | Par defaut |
|----------|-------------|------------|
| `MCP_TRANSPORT` | Mode de transport : `stdio` ou `http` | `stdio` |
| `MCP_HTTP_PORT` | Port HTTP Streamable | `3100` |
| `MCP_HTTP_HOST` | Adresse de liaison HTTP | `127.0.0.1` |
| `UNITY_BRIDGE_PORT` | Port TCP pour le pont de l'Unity Editor | `7691` |
| `UNITY_BRIDGE_AUTO_CONNECT` | Connexion automatique a Unity au demarrage | `true` |
| `UNITY_BRIDGE_TIMEOUT` | Delai d'attente de connexion du pont (ms) | `5000` |
| `UNITY_PROJECT_PATH` | Chemin vers le projet Unity (detection automatique si vide) | — |
| `EMBEDDING_PROVIDER` | Fournisseur d'embeddings : `gemini`, `openai`, `ollama` | `gemini` |
| `EMBEDDING_MODEL` | Nom du modele d'embedding | `gemini-embedding-2-preview` |
| `EMBEDDING_DIMENSIONS` | Dimensions d'embedding (128-3072) | `768` |
| `EMBEDDING_API_KEY` | Cle API du fournisseur d'embeddings | — |
| `RAG_AUTO_INDEX` | Indexation automatique au demarrage | `true` |
| `RAG_WATCH_FILES` | Surveiller les modifications de fichiers | `false` |
| `BRAIN_URL` | URL HTTP de Strada.Brain (vide = desactive) | — |
| `BRAIN_API_KEY` | Cle API de Brain | — |
| `ALLOWED_PATHS` | Liste separee par des virgules des repertoires racine autorises | — |
| `READ_ONLY` | Mode global lecture seule | `false` |
| `SCRIPT_EXECUTE_ENABLED` | Activer l'execution de scripts Roslyn | `false` |
| `REFLECTION_INVOKE_ENABLED` | Activer l'invocation de methodes par reflexion C# | `false` |
| `MAX_FILE_SIZE` | Taille maximale de fichier (octets) | `10485760` |
| `LOG_LEVEL` | Niveau de log : `debug`, `info`, `warn`, `error` | `info` |
| `LOG_FILE` | Chemin du fichier de log (stderr si vide) | — |

## Integration Brain

Lorsque connecte a Strada.Brain (`BRAIN_URL` configure) :

- **Memoire partagee** : La memoire a long terme de Brain alimente les suggestions d'outils
- **RAG fusionne** : Contexte memoire de Brain + AST MCP Tree-sitter combines
- **Apprentissage** : Les patterns d'utilisation des outils alimentent le pipeline d'apprentissage de Brain
- **Execution d'objectifs** : Brain peut invoquer les outils MCP dans le cadre de plans d'objectifs

Sans Brain, Strada.MCP fonctionne comme un serveur MCP entierement independant.

## Securite

| Couche | Protection |
|--------|-----------|
| Validation des entrees | Schema Zod + verification de types sur tous les outils |
| Protection des chemins | Prevention de traversee de repertoire, rejet de byte nul, prevention de traversee de symlink |
| Mode lecture seule | Application globale + par outil des permissions d'ecriture |
| Nettoyage des identifiants | Nettoyage des patterns de cles API/tokens dans toutes les sorties |
| Liste blanche d'outils | Le pont Unity n'accepte que les commandes JSON-RPC enregistrees |
| Limitation de debit | Protection de limitation de debit de l'API d'embeddings |
| Localhost uniquement | Le pont Unity se lie uniquement a 127.0.0.1 |
| Execution de scripts | Execution Roslyn desactivee par defaut, opt-in explicite |

Pour les details complets, voir [SECURITY.md](../SECURITY.md).

## Developpement

### Compiler depuis le code source

```bash
git clone https://github.com/okandemirel/Strada.MCP.git
cd Strada.MCP
npm install
npm run build
```

### Executer les tests

```bash
npm test              # Executer tous les tests
npm run test:watch    # Mode surveillance
npm run typecheck     # Verification des types TypeScript
```

### Mode developpement

```bash
npm run dev           # Executer avec tsx (rechargement automatique)
```

### Structure du projet

```
src/
  config/          - Configuration validee par Zod
  security/        - Protection des chemins, nettoyeur, validateur
  tools/
    strada/        - 10 outils du framework Strada
    unity/         - 18 outils Unity dependants du pont
    file/          - 6 outils d'operations de fichiers
    search/        - 3 outils de recherche (glob, grep, RAG)
    git/           - 6 outils git
    dotnet/        - 2 outils de build .NET
    analysis/      - 4 outils d'analyse de code
  intelligence/
    parser/        - Analyseur C# Tree-sitter
    rag/           - Embedding, chunker, index HNSW
  bridge/          - Client TCP du pont Unity
  context/         - Client HTTP Brain
  resources/       - 10 ressources MCP
  prompts/         - 6 prompts MCP
  utils/           - Logger, executeur de processus

unity-package/
  com.strada.mcp/  - Package C# de l'Unity Editor (UPM)
```

## Contribuer

Voir [CONTRIBUTING.md](../CONTRIBUTING.md) pour la configuration du developpement, les standards de code et les directives de PR.

## Licence

Licence MIT. Voir [LICENSE](../LICENSE) pour les details.
