/**
 * What an empty PlayMode run is empty OF.
 *
 * Measured 2026-09-06, campaign mcov1: two runs in 25 minutes answered
 * "the project has no PlayMode tests, or the filter matched nothing" against a
 * project with five PlayMode test files in Assets/Tests/PlayMode. The tool had
 * the filter in hand and the project on disk, and named neither — so the agent
 * could not tell a typo in its own filter from a suite Unity dropped, and
 * verified again instead of fixing either.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { TestRunOutcome } from './nunit-results.js';

/** Directories under Assets/ that never hold an asmdef worth reading. */
const SKIP_DIRS = new Set(['.git', 'Library', 'Temp', 'Logs', 'obj', 'node_modules']);

/**
 * Names of the assemblies under Assets/ that Unity's test runner would load in
 * PlayMode: an asmdef that references the test runner (or NUnit directly) and
 * is not pinned to the Editor platform.
 */
export function findPlayModeTestAssemblies(projectPath: string): string[] {
  const found: string[] = [];
  const walk = (dir: string, depth: number): void => {
    if (depth > 12) return;
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (SKIP_DIRS.has(entry)) continue;
      const full = join(dir, entry);
      let isDir = false;
      try {
        isDir = statSync(full).isDirectory();
      } catch {
        continue;
      }
      if (isDir) {
        walk(full, depth + 1);
      } else if (entry.endsWith('.asmdef')) {
        const name = playModeTestAssemblyName(full);
        if (name !== null) found.push(name);
      }
    }
  };
  walk(join(projectPath, 'Assets'), 0);
  return found.sort();
}

function playModeTestAssemblyName(asmdefPath: string): string | null {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(readFileSync(asmdefPath, 'utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
  const refs = Array.isArray(parsed['references']) ? (parsed['references'] as unknown[]) : [];
  const precompiled = Array.isArray(parsed['precompiledReferences'])
    ? (parsed['precompiledReferences'] as unknown[])
    : [];
  const isTest =
    refs.some((r) => typeof r === 'string' && /TestRunner$/i.test(r)) ||
    precompiled.some((r) => typeof r === 'string' && /^nunit\.framework/i.test(r));
  if (!isTest) return null;
  const platforms = Array.isArray(parsed['includePlatforms'])
    ? (parsed['includePlatforms'] as unknown[])
    : [];
  const editorOnly = platforms.length === 1 && platforms[0] === 'Editor';
  if (editorOnly) return null;
  const name = parsed['name'];
  return typeof name === 'string' && name.trim() !== '' ? name.trim() : null;
}

/**
 * The headline for a run that executed no test, naming which of the possible
 * causes the measurements support. Never the disjunction of all of them.
 */
export function describeEmptyRun(
  outcome: TestRunOutcome,
  filter: string | undefined,
  categories: string | undefined,
  testAssemblies: readonly string[] | undefined,
): string {
  const scope = [
    filter?.trim() ? `filter "${filter.trim()}"` : null,
    categories?.trim() ? `categories "${categories.trim()}"` : null,
  ].filter((s): s is string => s !== null);
  const assemblies =
    testAssemblies === undefined
      ? ''
      : testAssemblies.length === 0
        ? ' Measured: no asmdef under Assets/ references UnityEngine.TestRunner — the project ' +
          'has no PlayMode test assembly. Write one before verifying.'
        : ` Measured: ${testAssemblies.length} PlayMode test assembl${testAssemblies.length === 1 ? 'y' : 'ies'} ` +
          `under Assets/: ${testAssemblies.join(', ')}.`;

  if (scope.length > 0) {
    return (
      `PlayMode verification FAILED: no test executed — ${scope.join(' and ')} matched nothing ` +
      `(total=${outcome.total}). This is a scope problem, not a game problem: name a real ` +
      `namespace, class or assembly, or run unfiltered.${assemblies}`
    );
  }
  if (outcome.total > 0) {
    return (
      `PlayMode verification FAILED: no test executed — the unfiltered run found ${outcome.total} ` +
      `tests and skipped all of them (skipped=${outcome.skipped}, passed=0). NUnit skips a whole ` +
      `assembly whose constraints exclude the platform; read the skip reasons, not the game.${assemblies}`
    );
  }
  const dropped =
    testAssemblies !== undefined && testAssemblies.length > 0
      ? ' Unity loaded none of them: an assembly is dropped, not failed, when a reference in its ' +
        'asmdef does not resolve or its defineConstraints are unmet — look in the log tail below.'
      : '';
  return (
    `PlayMode verification FAILED: no test executed — the unfiltered run found ZERO PlayMode ` +
    `tests.${assemblies}${dropped}`
  );
}
