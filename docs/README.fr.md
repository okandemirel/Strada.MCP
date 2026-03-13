<div align="center">
  <h1>Strada.MCP</h1>
  <p><strong>Le serveur MCP Unity le plus complet avec prise en charge du framework</strong></p>
  <p>49 outils, 10 ressources, 6 prompts — avec l'intelligence Strada.Core, la recherche RAG et le pont vers l'editeur Unity</p>

  <p>
    <a href="https://github.com/okandemirel/Strada.MCP/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="Licence: MIT"></a>
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

Strada.MCP est un serveur Model Context Protocol (MCP) concu specifiquement pour le developpement Unity et Strada.Core. Il relie les assistants IA (Claude, GPT, etc.) directement a votre flux de travail Unity.

**Architecture a double usage :**
- **Mode autonome** — Fonctionne directement avec Claude Desktop, Cursor, Windsurf, VS Code + Continue
- **Mode Brain** — S'integre a Strada.Brain pour une memoire amelioree, l'apprentissage et l'execution d'objectifs

**Pourquoi Strada.MCP ?**
- **Connaissance du framework** : Le seul serveur MCP Unity qui comprend les patterns Strada.Core (ECS, MVCS, DI, modules)
- **Ensemble d'outils complet** : 49 outils couvrant fichiers, git, .NET, analyse de code, scaffolding Strada et operations runtime Unity
- **Recherche RAG** : Parsing Tree-sitter C# + embeddings Gemini + recherche vectorielle HNSW
- **Pont en temps reel** : Pont TCP vers l'editeur Unity pour la manipulation de scenes en direct, l'edition de composants et le controle du mode lecture
- **Securite d'abord** : Prevention de traversee de chemin, nettoyage des identifiants, mode lecture seule, execution de scripts par activation explicite

## Demarrage Rapide

### 1. Installation

```bash
npm install -g strada-mcp
```

Ou compiler depuis les sources :

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
        "UNITY_PROJECT_PATH": "/chemin/vers/votre/projet"
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
        "UNITY_PROJECT_PATH": "/chemin/vers/votre/projet"
      }
    }
  }
}
```

### 3. Installer le package Unity (optionnel — pour un acces complet aux outils)

Unity Package Manager > "+" > Ajouter un package depuis une URL Git :

```
https://github.com/okandemirel/Strada.MCP.git?path=unity-package/com.strada.mcp
```

### 4. Commencer a utiliser

Demandez a votre assistant IA de travailler avec votre projet Unity :
- "Cree un composant ECS Health avec les champs Current et Max"
- "Trouve tous les GameObjects avec un composant Rigidbody"
- "Analyse l'architecture du projet pour detecter les anti-patterns"
- "Recherche la logique de calcul de degats dans le code"

## Fonctionnalites

### Categories d'Outils (49 au total)

| Categorie | Nombre | Pont Unity requis |
|-----------|--------|-------------------|
| Strada Framework | 10 | Non |
| Unity Runtime | 18 | Oui |
| Operations fichier | 6 | Non |
| Recherche | 3 | Non |
| Git | 6 | Non |
| Build .NET | 2 | Non |
| Analyse | 4 | Non |

- **Unity ferme** : 31 outils disponibles (fichiers, git, recherche, analyse, scaffolding Strada, .NET)
- **Unity ouvert** : Les 49 outils actifs via le pont

### Outils Strada Framework

Ces outils sont uniques a Strada.MCP — aucun concurrent ne propose de scaffolding avec connaissance du framework.

| Outil | Description |
|-------|-------------|
| `strada_create_component` | Genere une structure de composant ECS implementant IComponent avec StructLayout |
| `strada_create_system` | Genere un systeme ECS Strada (SystemBase, JobSystemBase ou BurstSystemBase) |
| `strada_create_module` | Genere un module Strada avec ModuleConfig, definition d'assembly et structure de dossiers |
| `strada_create_mediator` | Genere un EntityMediator liant les composants ECS a une View Unity |
| `strada_create_service` | Genere un service Strada (Service, TickableService, FixedTickableService, OrderedService) |
| `strada_create_controller` | Genere un Controller Strada avec reference de modele typee et injection de vue |
| `strada_create_model` | Genere un Model ou ReactiveModel Strada avec des proprietes typees |
| `strada_analyze_project` | Analyse les fichiers .cs pour cartographier les modules, systemes, composants, services et l'utilisation de DI |
| `strada_validate_architecture` | Valide les conventions de nommage, les regles de cycle de vie et les regles de dependance de Strada.Core |
| `strada_scaffold_feature` | Genere un squelette complet de fonctionnalite : module + composants + systemes + vues MVCS optionnelles |

### Outils Unity Runtime (18)

| Outil | Description |
|-------|-------------|
| `unity_create_gameobject` | Creer un nouveau GameObject (vide, primitif ou depuis un prefab) |
| `unity_find_gameobjects` | Trouver des GameObjects par nom, tag, couche ou type de composant |
| `unity_modify_gameobject` | Modifier les proprietes d'un GameObject (nom, actif, tag, couche, statique) |
| `unity_delete_gameobject` | Supprimer un GameObject de la scene par ID d'instance |
| `unity_duplicate_gameobject` | Dupliquer un GameObject avec un nouveau nom, parent ou decalage optionnels |
| `unity_add_component` | Ajouter un composant a un GameObject par nom de type |
| `unity_remove_component` | Supprimer un composant d'un GameObject par nom de type |
| `unity_get_components` | Lister tous les composants attaches a un GameObject |
| `unity_set_transform` | Definir la position, la rotation et/ou l'echelle du transform d'un GameObject |
| `unity_get_transform` | Obtenir le transform actuel d'un GameObject (position, rotation, echelle) |
| `unity_set_parent` | Deplacer un GameObject sous un nouveau transform parent |
| `unity_play` | Controler le mode lecture Unity (lecture, pause, arret ou avancer d'une image) |
| `unity_get_play_state` | Obtenir l'etat actuel de lecture de l'editeur Unity |
| `unity_execute_menu` | Executer une commande de menu de l'editeur Unity par chemin |
| `unity_console_log` | Ecrire un message dans la console Unity (log, avertissement ou erreur) |
| `unity_console_clear` | Effacer la console de l'editeur Unity |
| `unity_selection_get` | Obtenir les objets actuellement selectionnes dans l'editeur Unity |
| `unity_selection_set` | Definir la selection de l'editeur aux IDs d'instance specifies |

### Outils Fichier et Recherche (9)

| Outil | Description |
|-------|-------------|
| `file_read` | Lire le contenu d'un fichier avec numeros de ligne, offset/limite optionnels |
| `file_write` | Ecrire du contenu dans un fichier, creation des repertoires si necessaire |
| `file_edit` | Remplacer du texte dans un fichier par correspondance exacte de chaines |
| `file_delete` | Supprimer un fichier |
| `file_rename` | Renommer ou deplacer un fichier |
| `list_directory` | Lister le contenu d'un repertoire avec indicateurs fichier/repertoire |
| `glob_search` | Rechercher des fichiers correspondant a un pattern glob |
| `grep_search` | Rechercher dans le contenu des fichiers avec regex, lignes de contexte optionnelles |
| `code_search` | Recherche semantique de code basee sur RAG (necessite l'indexation) |

### Outils Git (6)

| Outil | Description |
|-------|-------------|
| `git_status` | Afficher l'etat de l'arbre de travail (format porcelain) |
| `git_diff` | Afficher les differences entre l'arbre de travail et l'index |
| `git_log` | Afficher l'historique des commits |
| `git_commit` | Preparer les fichiers et creer un commit |
| `git_branch` | Lister, creer, supprimer ou changer de branche |
| `git_stash` | Sauvegarder ou restaurer les modifications non commitees |

### Outils de Build .NET (2)

| Outil | Description |
|-------|-------------|
| `dotnet_build` | Compiler un projet .NET et analyser les erreurs/avertissements |
| `dotnet_test` | Executer les tests .NET et analyser le resume des resultats |

### Outils d'Analyse (4)

| Outil | Description |
|-------|-------------|
| `code_quality` | Analyser le code C# pour les anti-patterns et violations des bonnes pratiques Strada.Core |
| `csharp_parse` | Analyser le code source C# en un AST structure avec classes, structs, methodes, champs, namespaces |
| `dependency_graph` | Analyser les references d'assembly et les dependances de namespace du projet Unity, detecter les dependances circulaires |
| `project_health` | Verification complete de la sante du projet combinant qualite du code, analyse des dependances et statistiques de fichiers |

### Recherche de Code RAG

```
Source C# -> Tree-sitter AST -> Fragments Structurels -> Embeddings Gemini -> Index Vectoriel HNSW
```

- Recherche semantique de code sur l'ensemble du projet
- Comprend les limites classe/methode/champ
- Indexation incrementale (seuls les fichiers modifies sont re-indexes)
- Re-classement hybride : similarite vectorielle + mots-cles + contexte structurel

### Pont vers l'Editeur Unity

Connexion TCP en temps reel vers l'editeur Unity (port 7691) :
- Creer, trouver, modifier, supprimer des GameObjects
- Ajouter/supprimer/lire des composants
- Manipulation de transform (position, rotation, echelle, re-parentage)
- Controle du mode lecture (lecture, pause, arret, pas)
- Sortie console (log, avertissement, erreur, effacer)
- Gestion de la selection de l'editeur
- Execution de commandes de menu

## Ressources (10)

| URI | Description | Source |
|-----|-------------|--------|
| `strada://api-reference` | Documentation API Strada.Core | Basee sur fichiers |
| `strada://namespaces` | Hierarchie des namespaces Strada.Core | Basee sur fichiers |
| `strada://examples/{pattern}` | Exemples de code (ECS, MVCS, DI) | Basee sur fichiers |
| `unity://manifest` | Manifeste des packages Unity | Basee sur fichiers |
| `unity://project-settings/{category}` | Parametres du projet Unity par categorie | Basee sur fichiers |
| `unity://assemblies` | Definitions d'assembly Unity | Basee sur fichiers |
| `unity://file-stats` | Statistiques des fichiers du projet Unity | Basee sur fichiers |
| `unity://scene-hierarchy` | Hierarchie de la scene active | Pont |
| `unity://console-logs` | Sortie recente de la console | Pont |
| `unity://play-state` | Etat actuel du mode lecture | Pont |

## Prompts (6)

| Prompt | Description |
|--------|-------------|
| `create_ecs_feature` | Guide de creation de fonctionnalite ECS (composant, systeme, enregistrement de module) |
| `create_mvcs_feature` | Guide de scaffolding du pattern MVCS pour Strada.Core |
| `analyze_architecture` | Prompt de revue d'architecture pour les projets Strada.Core |
| `debug_performance` | Guide de debogage de performance pour les projets Unity |
| `optimize_build` | Liste de verification d'optimisation de build pour les projets Unity |
| `setup_scene` | Guide de workflow de configuration de scene pour les projets Unity |

## Configuration

Toutes les options sont configurees via des variables d'environnement :

| Variable | Description | Valeur par defaut |
|----------|-------------|-------------------|
| `MCP_TRANSPORT` | Mode de transport : `stdio` ou `http` | `stdio` |
| `MCP_HTTP_PORT` | Port HTTP Streamable | `3100` |
| `MCP_HTTP_HOST` | Adresse de liaison HTTP | `127.0.0.1` |
| `UNITY_BRIDGE_PORT` | Port TCP pour le pont vers l'editeur Unity | `7691` |
| `UNITY_BRIDGE_AUTO_CONNECT` | Connexion automatique a Unity au demarrage | `true` |
| `UNITY_BRIDGE_TIMEOUT` | Delai d'attente de connexion du pont (ms) | `5000` |
| `UNITY_PROJECT_PATH` | Chemin vers le projet Unity (detection auto si vide) | — |
| `EMBEDDING_PROVIDER` | Fournisseur d'embeddings : `gemini`, `openai`, `ollama` | `gemini` |
| `EMBEDDING_MODEL` | Nom du modele d'embedding | `gemini-embedding-2-preview` |
| `EMBEDDING_DIMENSIONS` | Dimensions d'embedding (128-3072) | `768` |
| `EMBEDDING_API_KEY` | Cle API du fournisseur d'embeddings | — |
| `RAG_AUTO_INDEX` | Indexation automatique au demarrage | `true` |
| `RAG_WATCH_FILES` | Surveiller les modifications de fichiers | `false` |
| `BRAIN_URL` | URL HTTP Strada.Brain (vide = desactive) | — |
| `BRAIN_API_KEY` | Cle API Brain | — |
| `READ_ONLY` | Mode lecture seule global | `false` |
| `SCRIPT_EXECUTE_ENABLED` | Activer l'execution de scripts Roslyn | `false` |
| `MAX_FILE_SIZE` | Taille maximale de fichier (octets) | `10485760` |
| `LOG_LEVEL` | Niveau de log : `debug`, `info`, `warn`, `error` | `info` |
| `LOG_FILE` | Chemin du fichier de log (stderr si vide) | — |

## Integration Brain

Lorsque connecte a Strada.Brain (`BRAIN_URL` configure) :

- **Memoire partagee** : La memoire a long terme de Brain informe les suggestions d'outils
- **RAG unifie** : Contexte memoire Brain + AST tree-sitter MCP combines
- **Apprentissage** : Les patterns d'utilisation des outils alimentent le pipeline d'apprentissage de Brain
- **Execution d'objectifs** : Brain peut invoquer les outils MCP dans le cadre de plans d'objectifs

Sans Brain, Strada.MCP fonctionne comme un serveur MCP entierement independant.

## Securite

| Couche | Protection |
|--------|-----------|
| Validation d'entree | Schema Zod + verification de types sur tous les outils |
| Protection de chemin | Prevention de traversee de repertoire, rejet de bytes null, prevention de traversee de liens symboliques |
| Mode lecture seule | Application globale + par outil des permissions d'ecriture |
| Nettoyage d'identifiants | Nettoyage des patterns de cles API/tokens dans toutes les sorties |
| Liste blanche d'outils | Le pont Unity n'accepte que les commandes JSON-RPC enregistrees |
| Limitation de debit | Protection de limite de debit de l'API d'embeddings |
| Localhost uniquement | Le pont Unity se lie uniquement a 127.0.0.1 |
| Execution de scripts | Execution Roslyn desactivee par defaut, activation explicite requise |

Pour plus de details, consultez [SECURITY.md](../SECURITY.md).

## Developpement

### Compiler depuis les sources

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

## Contribuer

Pour la configuration de developpement, les standards de code et les directives de PR, consultez [CONTRIBUTING.md](../CONTRIBUTING.md).

## Licence

Licence MIT. Pour plus de details, consultez [LICENSE](../LICENSE).
