# Strada.MCP Master Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the most comprehensive framework-aware Unity MCP server — 83 tools, 10 resources, 6 prompts with tree-sitter C# parsing, RAG pipeline, Unity Editor bridge, and Strada.Brain integration.

**Architecture:** Layered design with 4 tiers — Transport (stdio + Streamable HTTP), Tool Layer (10 categories, 83 tools), Intelligence Layer (RAG + tree-sitter), Integration Layer (Unity Bridge + Brain Bridge). Two-component system: TypeScript MCP server + C# Unity Editor package.

**Tech Stack:** TypeScript 5.x, @modelcontextprotocol/sdk, better-sqlite3, hnswlib-node, zod, glob, tree-sitter, tree-sitter-c-sharp, Vitest

---

## Phase Overview

| Phase | Name | Tools | Depends On | Parallel With |
|-------|------|-------|------------|---------------|
| 1 | Project Skeleton + Transport + Config | 0 | — | — |
| 2 | Security Layer + File Tools | 6 | F1 | — |
| 3 | Search + Git + .NET Tools | 11 | F2 | F4 |
| 4 | Strada Framework Tools + API Reference | 10 | F2 | F3 |
| 5 | Tree-sitter C# Parser + Analysis Tools | 4 | F4 | F7 |
| 6 | RAG Pipeline | 3 | F5 | — |
| 7 | Unity Bridge Protocol | 0 | F2 | F5 |
| 8 | Unity Runtime Tools | 18 | F7 | F15 |
| 9 | Unity Scene, Prefab, Asset Tools | 8 | F8 | — |
| 10 | Unity Subsystem Tools | 14 | F9 | — |
| 11 | Unity Project Config Tools | 4 | F10 | — |
| 12 | Advanced Tools | 5 | F8 | — |
| 13 | MCP Resources + Prompts | 10R+6P | F4 | F14 |
| 14 | Brain Bridge | 0 | F6 | F13 |
| 15 | Unity Package (C#) | 0 | F7 | F8 |
| 16 | Documentation (8 languages) | 0 | F15 | — |
| 17 | Integration Tests + Polish | 0 | ALL | — |

## Dependency Graph

```
F1 ─── F2 ─┬─ F3 ─────────────────────────────────────┐
            ├─ F4 ─── F5 ─── F6 ─── F14 ──────────────┤
            │         │                                 │
            │         └──(parallel)── F7 ─┬─ F8 ─┬─ F9 ── F10 ── F11
            │                             │      └─ F12│
            │                             └─ F15 ──────┤
            └─ F4 ─── F13 ────────────────────────────┤
                                                       │
                                            F15 ── F16 ┤
                                                       │
                                              ALL ── F17
```

## Quality Gates (Every Phase)

1. `npx tsc --noEmit` — zero type errors
2. `npx vitest run` — all tests pass
3. Code review for security patterns
4. Commit with descriptive message

## Phase Plan Files

Each phase has its own detailed plan:
- `docs/plans/phase-01-skeleton.md`
- `docs/plans/phase-02-security-file-tools.md`
- `docs/plans/phase-03-search-git-dotnet.md`
- `docs/plans/phase-04-strada-tools.md`
- `docs/plans/phase-05-parser-analysis.md`
- `docs/plans/phase-06-rag-pipeline.md`
- `docs/plans/phase-07-unity-bridge.md`
- `docs/plans/phase-08-unity-runtime.md`
- `docs/plans/phase-09-scene-prefab-asset.md`
- `docs/plans/phase-10-subsystems.md`
- `docs/plans/phase-11-project-config.md`
- `docs/plans/phase-12-advanced-tools.md`
- `docs/plans/phase-13-resources-prompts.md`
- `docs/plans/phase-14-brain-bridge.md`
- `docs/plans/phase-15-unity-package.md`
- `docs/plans/phase-16-documentation.md`
- `docs/plans/phase-17-integration-polish.md`
