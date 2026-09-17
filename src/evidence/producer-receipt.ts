/**
 * The receipt a producer returns for the run it was asked to make.
 *
 * Strada.Brain issues a TICKET before it dispatches a tool and validates a
 * RECEIPT afterwards: without one, every proof of a delivery is a file that
 * could have been written by anything, with nothing binding it to the
 * invocation that made it (Strada.Brain, `src/campaign/producer-evidence.ts`).
 *
 * A receipt states only what this process MEASURED: the run it belongs to,
 * what kind of work it was, the tree it ran against, and how the process
 * ended. It never repeats a judgement the caller can make for itself.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';

export const EVIDENCE_FENCE = 'strada-evidence';

/**
 * The digest SCHEME, mixed into every artifact digest — the same string
 * Strada.Brain uses. A record written under the old path-and-size scheme must
 * never look like one written under this one (Codex 2026-09-13 AH#8).
 */
export const ARTIFACT_DIGEST_VERSION = 'strada-artifact-v3-layout';

export interface ReceiptExecution {
  readonly completed: boolean;
  /** `null` when this operation owns no process of its own (a live bridge). */
  readonly exitCode: number | null;
  readonly timedOut: boolean;
}

/**
 * One session a play-through receipt answers for.
 *
 * Every field is a MEASUREMENT: a runner that cannot say which session it was
 * asked for, or whether the game confirmed the identity, must leave the
 * session out rather than fill the gap in — the receiver then reports the
 * session as missing instead of admitting an invented one.
 */
export interface ReceiptSession {
  readonly requestedIndex: number;
  readonly index: number;
  readonly observedIndex?: number;
  readonly identityVerified: boolean;
  readonly identitySource?: 'active-session' | 'start-acceptance' | 'unverified';
  readonly actions: number;
  readonly outcome: string;
  readonly reachedOutcome: boolean;
  readonly seconds: number;
}

export interface ReceiptInput {
  readonly runId: string;
  readonly kind: 'compile' | 'playmode-suite' | 'player-build' | 'playthrough';
  readonly medium: 'compiler' | 'editor' | 'builder' | 'player';
  readonly projectPath: string;
  readonly execution: ReceiptExecution;
  readonly target?: string;
  readonly artifactPath?: string;
  readonly sessionCount?: number;
  readonly sessions?: readonly ReceiptSession[];
  readonly payload?: Record<string, unknown>;
}

/**
 * The project's revision as THIS process reads it.
 *
 * Three answers, not two: the revision; `''` for a project this process
 * CONFIRMED has no repository (no `.git` anywhere above it); and `undefined`
 * when it could not tell. A correct project outside any repository used to
 * produce a receipt with no revision at all while the coordinator bound `''`,
 * so the two never agreed and no run on such a project could be admitted
 * (Codex 2026-09-13 AI#6). Unknown stays unknown: it is not "no repository".
 */
export function projectRevision(projectPath: string): string | undefined {
  try {
    const out = execFileSync('git', ['-C', projectPath, 'rev-parse', 'HEAD'], {
      encoding: 'utf8',
      timeout: 5_000,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (/^[0-9a-f]{40}$/i.test(out)) return out;
  } catch {
    /* fall through to the repository question */
  }
  return noRepositoryHere(projectPath) ? '' : undefined;
}

/** Is there CONFIRMED no repository above this path? */
function noRepositoryHere(projectPath: string): boolean {
  try {
    const inside = execFileSync('git', ['-C', projectPath, 'rev-parse', '--is-inside-work-tree'], {
      encoding: 'utf8',
      timeout: 5_000,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    // Inside a work tree with no readable HEAD: an unborn or broken
    // repository, which is not the same as having none.
    return inside !== 'true' ? !anyGitAbove(projectPath) : false;
  } catch {
    // The command also fails when git itself cannot run, and those cannot be
    // told apart — so only a tree with no `.git` anywhere above it counts.
    return !anyGitAbove(projectPath);
  }
}

function anyGitAbove(from: string): boolean {
  let at = resolve(from);
  for (;;) {
    if (existsSync(join(at, '.git'))) return true;
    const up = dirname(at);
    if (up === at) return false;
    at = up;
  }
}

/**
 * What an artifact IS, as this machine reads it.
 *
 * A player artifact can be a bundle DIRECTORY (macOS .app) or a single file,
 * so the digest covers the tree: each path and its size, in a fixed order.
 * Strada.Brain computes the same digest for the ticket it issues — the two
 * must agree, or the play-through is not about the build.
 */
export function artifactDigest(path: string | undefined): string | undefined {
  if (path === undefined || path === '') return undefined;
  try {
    const hash = createHash('sha256');
    // THE BYTES, not the names and sizes: two different files of the same
    // size hashed identically (Codex 2026-09-13 AH#8). The scheme is named in
    // the digest so an old record cannot pass as one written under this one.
    hash.update(`${ARTIFACT_DIGEST_VERSION}\n`);
    // WHICH artifact in that layout, so two executables shipped side by side
    // are not one artifact.
    hash.update(`${basename(path)}\n`);
    // THE FILES THE BUILD SAID IT SHIPPED, when it said: the layout walk picks
    // up whatever is written beside the executable afterwards (AJ#4).
    const manifest = artifactManifest(path);
    if (manifest !== undefined) {
      // The listed files, each by name, size and bytes: dropping one from the
      // list drops its line, so the manifest's own formatting is not part of
      // the artifact's identity (a reformatted manifest is the same game).
      const base = dirname(path);
      for (const rel of [...manifest.files].sort()) {
        const at = join(base, rel);
        const st = statSync(at);
        hash.update(`${rel}:${st.size}\n`);
        hash.update(readFileSync(at));
      }
      return hash.digest('hex');
    }
    const walk = (at: string, rel: string): void => {
      const st = statSync(at);
      if (st.isDirectory()) {
        for (const entry of readdirSync(at).sort()) walk(join(at, entry), `${rel}/${entry}`);
        return;
      }
      hash.update(`${rel}:${st.size}\n`);
      hash.update(readFileSync(at));
    };
    walk(playerLayoutRoot(path), '');
    // A single-file player (an .apk) with an expansion file beside it: the
    // .obb is the game's data, and a manifest-less digest of the .apk alone
    // left it out (round 3 #4).
    if (playerLayoutRoot(path) === path && !statSync(path).isDirectory()) {
      const stem = basename(path).replace(/\.[^.]+$/u, '');
      for (const entry of readdirSync(dirname(path)).sort()) {
        if (entry !== basename(path) && entry.startsWith(stem) && /\.obb$/iu.test(entry)) walk(join(dirname(path), entry), '/' + entry);
      }
    }
    return hash.digest('hex');
  } catch {
    return undefined;
  }
}

/**
 * THE FILES A BUILD SAID IT SHIPPED.
 *
 * Hashing the whole player layout pulls in whatever is written beside the
 * executable AFTERWARDS — a log the game writes on its first run, another
 * build copied into the same folder — so an artifact nobody touched hashed
 * differently before and after it ran (Codex 2026-09-13 AJ#4). A build that
 * states its own manifest is measured on exactly those files; one that states
 * none is measured on its layout, as before.
 *
 * The manifest sits BESIDE the artifact, never inside it: a stray file inside
 * a macOS .app changes the bundle.
 */
export const ARTIFACT_MANIFEST_SUFFIX = '.strada-artifact.json';
export const ARTIFACT_MANIFEST_VERSION = 'strada-manifest-v1';

/**
 * The manifest a build wrote for this artifact, or nothing.
 *
 * A MANIFEST THAT LEAVES THE GAME OUT IS NOT A MANIFEST. `files:
 * ["readme.txt"]` beside Game.exe was accepted and the digest then covered
 * readme.txt and the executable's NAME: the executable could be replaced
 * while the digest stood, and every receipt keyed on it followed (Codex
 * 2026-09-16 D78). A manifest is adopted only when it names the artifact
 * itself in full — the executable with every <Name>_Data folder and runtime
 * library beside it, or a bundle entire — and every entry resolves INSIDE
 * the folder the manifest sits in (no symlink out). Anything else falls back
 * to the layout walk, which covers everything; a declared file the tree does
 * not have leaves the artifact with no digest at all. Strada.Brain applies the same
 * rule (evidence-ledger.ts); the two must agree, or the receipt is not about
 * the build.
 */
export function artifactManifest(path: string): { readonly bytes: string; readonly files: readonly string[] } | undefined {
  try {
    const bytes = readFileSync(`${path}${ARTIFACT_MANIFEST_SUFFIX}`, 'utf8');
    const parsed: unknown = JSON.parse(bytes);
    if (parsed === null || typeof parsed !== 'object') return undefined;
    const doc = parsed as { version?: unknown; files?: unknown };
    if (doc.version !== ARTIFACT_MANIFEST_VERSION) return undefined;
    if (!Array.isArray(doc.files) || doc.files.length === 0) return undefined;
    const files: string[] = [];
    for (const entry of doc.files) {
      // A path that leaves the layout is not a file this build shipped.
      if (typeof entry !== 'string' || entry === '' || entry.includes('..') || entry.startsWith('/') || /^[A-Za-z]:[\\/]/.test(entry)) return undefined;
      files.push(entry.replace(/\\/g, '/').replace(/^\.\//, ''));
    }
    if (!manifestCoversTheGame(path, files)) return undefined;
    return { bytes, files };
  } catch {
    return undefined;
  }
}

/**
 * Does the manifest list EVERY file of the game, as this process recognises
 * its layout, and nothing outside the folder it sits in?
 *
 * Naming the executable and "something under Game_Data" was not enough: a
 * manifest listing Game.exe and one level left level1, UnityPlayer.dll and
 * MonoBleedingEdge out of the identity, a .app's readme could stand in for
 * its binary, and a WebGL folder needed nothing but index.html (Codex
 * 2026-09-17 D78 review #1-#3). The rule is a superset check against the
 * runtime set the layout implies; what the build did not ship (a log
 * written beside the player) may be left out, what it shipped may not.
 * Strada.Brain applies the same rule (evidence-ledger.ts).
 */
function manifestCoversTheGame(path: string, files: readonly string[]): boolean {
  const base = dirname(path);
  const name = basename(path);
  let isDirectory: boolean;
  try {
    isDirectory = statSync(path).isDirectory();
  } catch {
    return false;
  }
  // Every entry resolves inside the folder the manifest sits in: a symlink to
  // another build is out. A declared file that is NOT THERE adopts the
  // manifest as it stands: the digest fails on it, and "no digest" is the
  // answer for a build that says it shipped a file the tree does not have
  // (review #5) — never a walk that hashes what is left.
  // …judged for EVERY entry before containment is: with a symlink out listed
  // before a missing file the manifest was refused and walked, with the
  // order reversed it was adopted and yielded no digest (Codex 2026-09-17 on
  // 04dd905d #10). Missing first, whatever the order.
  const layoutRoot = realpathSync.native(base);
  const resolved: string[] = [];
  for (const rel of files) {
    try {
      resolved.push(realpathSync.native(join(base, rel)));
    } catch {
      return true;
    }
  }
  for (const real of resolved) {
    const inside = relative(layoutRoot, real);
    if (inside === '' || inside.startsWith('..') || isAbsolute(inside)) return false;
  }
  // Membership is case-blind: on a case-insensitive filesystem the layout is
  // the same layout under any spelling, and a wrong-case entry on a
  // case-sensitive one fails the digest's own read (fails closed).
  // …by RESOLVED IDENTITY, not by spelling: lower-casing let a manifest
  // listing `game.exe` stand for `Game.exe` on a case-sensitive disk that
  // held both, and the wrong executable was hashed (Codex 2026-09-17 round
  // 3 #3). The filesystem says which entries are one file.
  const listed = new Set(resolved);
  return requiredRuntimeFiles(path, base, name, isDirectory).every((required) => {
    try {
      return listed.has(realpathSync.native(join(base, required)));
    } catch {
      return false;
    }
  });
}

/**
 * The files a manifest has to list: a bundle (a .app, a WebGL folder) in
 * full; a player executable with every <Name>_Data folder, runtime library
 * (UnityPlayer, GameAssembly, MonoBleedingEdge) and WebGL Build/TemplateData
 * folder beside it. Relative to the folder the manifest sits in, "/"-joined.
 */
function requiredRuntimeFiles(path: string, base: string, name: string, isDirectory: boolean): string[] {
  const required: string[] = [];
  const walk = (at: string, rel: string): void => {
    for (const entry of readdirSync(at).sort()) {
      const child = join(at, entry);
      if (statSync(child).isDirectory()) walk(child, `${rel}/${entry}`);
      else required.push(`${rel}/${entry}`);
    }
  };
  if (isDirectory) {
    walk(path, name);
    return required;
  }
  required.push(name);
  for (const entry of readdirSync(base).sort()) {
    let directory: boolean;
    try {
      directory = statSync(join(base, entry)).isDirectory();
    } catch {
      continue;
    }
    if (directory) {
      if (isDataDir(entry) || RUNTIME_DIRS.has(entry.toLowerCase())) walk(join(base, entry), entry);
    } else if (RUNTIME_FILE_RE.test(entry)) {
      required.push(entry);
    }
  }
  return required;
}

// Lower-cased: a case-insensitive filesystem serves `Game_data` and
// `plugins` as the same folders (Codex 2026-09-17 on 04dd905d #9), and the
// native plugins beside a Windows player and a WebGL page's StreamingAssets
// are runtime too (#8).
const RUNTIME_DIRS = new Set(['monobleedingedge', 'build', 'templatedata', 'plugins', 'streamingassets']);
// …and the companions Unity ships beside a player: an Android expansion
// file (.obb) beside its .apk, the Windows crash handler (Codex 2026-09-17
// round 3 #4).
const RUNTIME_FILE_RE = /\.(?:dll|so|dylib|obb)$|^GameAssembly\.|^UnityCrashHandler.*\.exe$/i;
/** Unity writes `<Name>_Data` beside a player; the filesystem may serve it in any case. */
function isDataDir(entry: string): boolean {
  return /_data$/i.test(entry);
}

/**
 * The directory a Unity player's parts live in, or the path itself.
 *
 * A Windows or Linux player is an executable PLUS its `<Name>_Data` folder,
 * its runtime library and its plugins; hashing only the named file left every
 * asset, scene and managed assembly out of the artifact's identity — the whole
 * game could be replaced while the digest stood (Codex 2026-09-13 AI#9). Only
 * a layout this process can RECOGNISE is adopted: the file's own directory
 * must hold a `*_Data` folder, which is what Unity writes beside a player.
 * Hashing any parent directory would pull unrelated builds and mutable output
 * into the identity.
 */
export function playerLayoutRoot(path: string): string {
  try {
    if (statSync(path).isDirectory()) return path;
    const dir = dirname(path);
    const entries = readdirSync(dir);
    const hasData = entries.some((entry) => isDataDir(entry) && statSync(join(dir, entry)).isDirectory());
    // A WebGL player is index.html beside its Build folder (Codex 2026-09-17 D78 review #3).
    const buildDir = entries.find((entry) => entry.toLowerCase() === 'build');
    const webgl = basename(path).toLowerCase() === 'index.html' && buildDir !== undefined && statSync(join(dir, buildDir)).isDirectory();
    return hasData || webgl ? dir : path;
  } catch {
    return path;
  }
}

/**
 * The receipt itself, as the exact bytes a receiver will hash.
 *
 * A tool whose whole report is a JSON document cannot append a fenced block
 * without breaking every reader of that document, so it carries the receipt in
 * a field instead — the same bytes either way, which is what the hash is of.
 */
export function receiptRecord(input: ReceiptInput): string {
  const revision = projectRevision(input.projectPath);
  const artifactSha256 = artifactDigest(input.artifactPath);
  return JSON.stringify({
    schemaVersion: 1 as const,
    runId: input.runId,
    kind: input.kind,
    medium: input.medium,
    ...(revision === undefined ? {} : { revision }),
    ...(input.target === undefined ? {} : { target: input.target }),
    ...(artifactSha256 === undefined ? {} : { artifactSha256 }),
    execution: input.execution,
    ...(input.sessionCount === undefined ? {} : { sessionCount: input.sessionCount }),
    ...(input.sessions === undefined ? {} : { sessions: input.sessions }),
    ...(input.payload === undefined ? {} : { payload: input.payload }),
  });
}

/** The fenced block a tool appends to its own report. */
export function renderReceipt(input: ReceiptInput): string {
  return `\n\n\`\`\`${EVIDENCE_FENCE}\n${receiptRecord(input)}\n\`\`\``;
}

/** The run id a caller asked this invocation to answer for, when it did. */
export function evidenceRunId(input: Record<string, unknown>): string | undefined {
  const raw = input['evidenceRunId'];
  return typeof raw === 'string' && raw.trim() !== '' && raw.length <= 200 ? raw.trim() : undefined;
}

/** The receipt schema every tool that takes one advertises. */
export const EVIDENCE_RUN_ID_SCHEMA = {
  type: 'string',
  description:
    'The run id Strada.Brain issued for this invocation. When given, the tool appends a strada-evidence receipt ' +
    'naming the run, the tree it measured and how the process ended.',
} as const;
