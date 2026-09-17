/**
 * unity_run_player: the built player is the only medium whose frame rate
 * speaks for what a person sees. The player here is a shell script standing
 * in for the artifact: it receives the runner's arguments, writes the record
 * a real Strada.Core PlayerPlaythroughRunner would, and drops frames.
 *
 * The run budget (Strada.Brain plan 0-B.5): a request that cannot fit is
 * refused with a way out, never with itself (Codex 2026-09-17 AK#5), and
 * "all" is the catalogue this producer last saw for the artifact, not the
 * cap (AK#3) — for the artifact's BYTES, not its path: a rebuild at the same
 * path is budgeted as the cap until it has been measured (Codex round 5 #10).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { appendFileSync, chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { countRequestedSessions, findPlayerExecutable, largestDeadlineThatFits, newestArtifact, playerReceipt, playRunBudgetMs, previousCatalogue, runPlayerProcess, sessionsThatFit, RunPlayerTool, PLAYER_CAPTURE_SUBDIR, PLAY_RUN_BUDGET_MS } from './run-player.js';
import { encodeRgbPng } from './png-metrics.test.js';
import { artifactDigest } from '../../evidence/producer-receipt.js';

let root: string;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'run-player-')); });
afterEach(() => { rmSync(root, { recursive: true, force: true }); });

const drawn = (seed: number) => (x: number, y: number): [number, number, number] => [((x + seed) * 7) & 255, (y * 11) & 255, ((x ^ y) * 3) & 255];

/** A fake player: writes the record and two drawn frames where the runner is told to. */
function fakePlayer(dir: string, name: string, record: Record<string, unknown>): string {
  const frames = join(root, 'fixture-frames');
  mkdirSync(frames, { recursive: true });
  writeFileSync(join(frames, 'frame_00000.png'), encodeRgbPng(160, 90, drawn(0)));
  writeFileSync(join(frames, 'frame_00001.png'), encodeRgbPng(160, 90, drawn(40)));
  const recordPath = join(root, 'fixture-record.json');
  writeFileSync(recordPath, JSON.stringify(record));
  mkdirSync(dir, { recursive: true });
  const exe = join(dir, name);
  writeFileSync(
    exe,
    `#!/bin/sh\nout=""; cap=""\nwhile [ $# -gt 0 ]; do\n  case "$1" in\n    -stradaPlaythrough) out="$2"; shift;;\n    -stradaCaptureDir) cap="$2"; shift;;\n  esac\n  shift\ndone\nmkdir -p "$cap"; cp ${JSON.stringify(frames)}/*.png "$cap"/; cp ${JSON.stringify(recordPath)} "$out"\nexit 0\n`,
  );
  chmodSync(exe, 0o755);
  return exe;
}

const playerRecord = {
  medium: 'player', scene: 'Main', session: 1, driverType: 'Strada.Core.Play.IPlaythroughDriver', missing: '', phaseAfterBoot: 'Home',
  autoStarted: false, startAccepted: true, phasesSeen: ['Playing', 'Won'], actions: 9, outcome: 'Won', reachedOutcome: true,
  framesCaptured: 2, elapsedSeconds: 6.5, bootSeconds: 1.2, playSeconds: 4.0, playFrames: 240, worstFrameMs: 21, sessionCount: 3,
  sessions: [{ index: 1, startAccepted: true, phasesSeen: ['Playing', 'Won'], actions: 9, outcome: 'Won', reachedOutcome: true, seconds: 4.0, lastPhase: 'Won' }],
  errors: [], targetFrameRate: -1, vSyncCount: 1, screenWidth: 1280, screenHeight: 720,
};

describe('finding the player', () => {
  it('a macOS .app resolves to its MacOS executable; an .exe to itself; an .apk to nothing', () => {
    const app = join(root, 'Builds', 'macos', 'Game.app');
    mkdirSync(join(app, 'Contents', 'MacOS'), { recursive: true });
    writeFileSync(join(app, 'Contents', 'MacOS', 'Game'), '');
    expect(findPlayerExecutable(app)).toBe(join(app, 'Contents', 'MacOS', 'Game'));
    const exe = join(root, 'Builds', 'windows', 'Game.exe');
    mkdirSync(join(root, 'Builds', 'windows'), { recursive: true });
    writeFileSync(exe, '');
    expect(findPlayerExecutable(exe)).toBe(exe);
    const apk = join(root, 'Builds', 'android', 'game.apk');
    mkdirSync(join(root, 'Builds', 'android'), { recursive: true });
    writeFileSync(apk, '');
    expect(findPlayerExecutable(apk)).toBeNull();
    expect([app, exe, join(root, 'Builds', 'windows')]).toContain(newestArtifact(root));
  });

  it('no Builds/ means no artifact', () => {
    expect(newestArtifact(root)).toBeNull();
  });
});

describe('unity_run_player', () => {
  it('runs the newest artifact through the runner and judges the record it wrote, naming the player medium', async () => {
    fakePlayer(join(root, 'Builds', 'linux'), 'Game.x86_64', playerRecord);
    const tool = new RunPlayerTool();
    const result = await tool.execute({ deadlineSeconds: 5 }, { projectPath: root } as never);
    expect(result.isError).toBe(false);
    expect(result.content).toContain('Player: Game.x86_64');
    expect(result.content).toContain('PLAY-THROUGH OK');
    expect(result.content).toContain('Performance (built player, real rendering): boot 1.2 s from launch to services; 240 frames in 4.0 s = 60.0 fps average; worst frame 21 ms.');
    expect(result.content).toContain('Sessions: catalog 3 session(s); played 1: #1 Won in 9 actions (4.0 s).');
    const verdictPath = join(root, PLAYER_CAPTURE_SUBDIR, 'playthrough-verdict.json');
    expect(existsSync(verdictPath)).toBe(true);
    expect(JSON.parse(readFileSync(verdictPath, 'utf8')).perf).toMatchObject({ medium: 'player', avgFps: 60 });
  });

  it('an endless session passes, and the contract reaches the player (Codex 2026-09-13 AH#1)', async () => {
    // A sandbox that stays interactive is behaving as designed. The contract
    // went to the editor path and not to this one, so the player run still
    // came back refused.
    const endless = {
      ...playerRecord,
      outcome: 'None',
      reachedOutcome: false,
      phasesSeen: ['Playing'],
      sessions: [{ index: 1, startAccepted: true, phasesSeen: ['Playing'], actions: 60, outcome: 'None', reachedOutcome: false, seconds: 45, lastPhase: 'Playing' }],
    };
    fakePlayer(join(root, 'Builds', 'linux'), 'Game.x86_64', endless);
    const tool = new RunPlayerTool();

    const sandbox = await tool.execute({ deadlineSeconds: 5 }, { projectPath: root } as never);
    expect(sandbox.isError).toBe(false);
    expect(sandbox.content).toContain('PLAY-THROUGH OK');

    // The flag reaches the PLAYER's own arguments, so Core can decide how to
    // exit — the judge alone is not enough (AH#1).
    const args: string[] = [];
    const recording = join(root, 'Builds', 'linux', 'Game.x86_64');
    writeFileSync(
      recording,
      `#!/bin/sh\nprintf '%s\\n' "$@" > ${JSON.stringify(join(root, 'args.txt'))}\nexit 0\n`,
    );
    chmodSync(recording, 0o755);
    await tool.execute({ deadlineSeconds: 5, outcomeRequired: true }, { projectPath: root } as never);
    args.push(...readFileSync(join(root, 'args.txt'), 'utf8').split('\n'));
    expect(args).toContain('-stradaPlaythroughOutcomeRequired');
    fakePlayer(join(root, 'Builds', 'linux'), 'Game.x86_64', endless);

    // …and a document that DOES require an outcome still refuses it.
    const required = await tool.execute({ deadlineSeconds: 5, outcomeRequired: true }, { projectPath: root } as never);
    expect(required.isError).toBe(true);
    expect(required.content).toContain('never ended after 60 actions');
  });

  it('a player that writes no record is not ok, and the header says why', async () => {
    const dir = join(root, 'Builds', 'linux');
    mkdirSync(dir, { recursive: true });
    const exe = join(dir, 'Game.x86_64');
    writeFileSync(exe, '#!/bin/sh\nexit 0\n');
    chmodSync(exe, 0o755);
    const result = await new RunPlayerTool().execute({}, { projectPath: root } as never);
    expect(result.isError).toBe(true);
    expect(result.content).toContain('the runner wrote no record');
    expect(result.content).toContain('no play-through record was written');
  });

  it('no artifact, or one this machine cannot run, is an error that names the fix', async () => {
    const none = await new RunPlayerTool().execute({}, { projectPath: root } as never);
    expect(none.isError).toBe(true);
    expect(none.content).toContain('run unity_build_player first');
    mkdirSync(join(root, 'Builds', 'android'), { recursive: true });
    writeFileSync(join(root, 'Builds', 'android', 'game.apk'), '');
    const apk = await new RunPlayerTool().execute({ artifactPath: 'Builds/android/game.apk' }, { projectPath: root } as never);
    expect(apk.isError).toBe(true);
    expect(apk.content).toContain('not a player this machine can run');
  });
});

/**
 * A player that died is not a player that played. The exit code was printed
 * in the header and nowhere else: the verdict FILE — what Strada.Brain reads
 * — stayed green on exit 42 (Codex 2026-09-12 Y).
 */
describe('a failing exit invalidates the verdict', () => {
  it('reaches the verdict the Brain reads, not only the text the model sees', async () => {
    const exe = fakePlayer(join(root, 'Builds', 'linux'), 'Game.x86_64', playerRecord);
    // The same fake player, with a failing exit after it has written
    // everything a good run writes.
    writeFileSync(exe, readFileSync(exe, 'utf8').replace('exit 0', 'exit 42'));
    chmodSync(exe, 0o755);

    const result = await new RunPlayerTool().execute({ deadlineSeconds: 5 }, { projectPath: root } as never);

    expect(result.content).toContain('exit 42');
    expect(result.isError).toBe(true);
    const written = JSON.parse(
      readFileSync(join(root, PLAYER_CAPTURE_SUBDIR, 'playthrough-verdict.json'), 'utf8'),
    ) as { ok: boolean; reasons: string[] };
    expect(written.ok).toBe(false);
    expect(written.reasons.join(' ')).toContain('the player exited 42');
  });
});

/**
 * ONE BUDGET, BOTH SIDES (Codex 2026-09-13 AJ#1).
 *
 * The run computed its deadline from the sessions and the document's session
 * length — twelve 150-second rounds need over half an hour — while the caller
 * abandoned the call after fifteen minutes. A game behaving exactly as its
 * document specifies could not be verified at all, and the abandoned player
 * kept running.
 */
describe('the run budget the caller waits for', () => {
  it('is the budget this tool advertises', () => {
    expect(new RunPlayerTool().metadata.timeoutMs).toBe(PLAY_RUN_BUDGET_MS);
  });

  it('counts the sessions a spec asks for the way the runner does', () => {
    expect(countRequestedSessions(undefined)).toBe(1);
    expect(countRequestedSessions('')).toBe(1);
    expect(countRequestedSessions('all')).toBe(12);
    expect(countRequestedSessions('1-5')).toBe(5);
    expect(countRequestedSessions('2,5')).toBe(2);
    expect(countRequestedSessions('3')).toBe(1);
    expect(countRequestedSessions('1-100')).toBe(12);
    expect(countRequestedSessions('nonsense')).toBe(1);
  });

  it('a request that needs longer than one run is REFUSED with the batch that fits', async () => {
    fakePlayer(join(root, 'Builds', 'linux'), 'Game.x86_64', playerRecord);
    // Twelve rounds of six minutes each: 72 minutes of play, and one run may
    // take 45. Nothing is played, and the message names the batch.
    const refused = await new RunPlayerTool().execute(
      { sessions: 'all', deadlineSeconds: 360 },
      { projectPath: root } as never,
    );
    expect(refused.isError).toBe(true);
    expect(refused.content).toContain('one run may take');
    expect(refused.content).toContain('Ask for sessions "1-7"');
    expect(refused.content).toContain('nothing was played');
    // …and the batch it names does run.
    const fits = await new RunPlayerTool().execute(
      { sessions: '1-7', deadlineSeconds: 360 },
      { projectPath: root } as never,
    );
    expect(fits.isError).toBe(false);
  });

  it('the arithmetic agrees with itself: what fits is what does not need more', () => {
    for (const deadline of [45, 90, 150, 360, 600]) {
      const fits = sessionsThatFit(deadline, 30);
      expect(playRunBudgetMs(fits, deadline, 30)).toBeLessThanOrEqual(PLAY_RUN_BUDGET_MS);
      expect(playRunBudgetMs(fits + 1, deadline, 30)).toBeGreaterThan(PLAY_RUN_BUDGET_MS);
    }
    // A single session whose allowance exceeds the run does NOT fit: zero,
    // never a floor of one that the refusal would re-propose (AK#5).
    expect(sessionsThatFit(10_000, 30)).toBe(0);
  });
});

describe('a request that cannot fit is refused with a way out (Strada.Brain plan 0-B.5)', () => {
  it('not even one session fits an 1800 s round with headroom (AK#5)', () => {
    expect(sessionsThatFit(2715, 30)).toBe(0);
    // The largest allowance one session fits is the inverse of the one-session budget.
    const max = Math.floor((PLAY_RUN_BUDGET_MS - ((30 + 15) * 1000 + 30_000)) / 1000) - 5;
    expect(largestDeadlineThatFits(30)).toBe(max);
    expect(largestDeadlineThatFits(30)).toBe(2620);
    expect(playRunBudgetMs(1, max, 30)).toBeLessThanOrEqual(PLAY_RUN_BUDGET_MS);
    expect(playRunBudgetMs(1, max + 1, 30)).toBeGreaterThan(PLAY_RUN_BUDGET_MS);
  });

  it('one session that does not fit is refused with a smaller allowance, never with "1-1" (AK#5)', async () => {
    fakePlayer(join(root, 'Builds', 'linux'), 'Game.x86_64', playerRecord);
    const refused = await new RunPlayerTool().execute(
      { sessions: '1', deadlineSeconds: 2715 },
      { projectPath: root } as never,
    );
    expect(refused.isError).toBe(true);
    expect(refused.content).toContain('nothing was played');
    expect(refused.content).toContain('one session at 2715 s does not fit one run (limit 2700 s with 30 s boot)');
    expect(refused.content).toContain('lower deadlineSeconds to at most 2620 s');
    expect(refused.content).toContain('this request cannot succeed as it is');
    expect(refused.content).not.toContain('Ask for sessions "1-1"');
    expect(refused.content).not.toContain('Ask for sessions');
  });

  it('a request some of which fits is still refused with the batch that does', async () => {
    fakePlayer(join(root, 'Builds', 'linux'), 'Game.x86_64', playerRecord);
    // Five rounds of ten minutes: 52 minutes against 45; four fit.
    const refused = await new RunPlayerTool().execute(
      { sessions: '1-5', deadlineSeconds: 600 },
      { projectPath: root } as never,
    );
    expect(refused.isError).toBe(true);
    expect(sessionsThatFit(600, 30)).toBe(4);
    expect(refused.content).toContain('Ask for sessions "1-4" and accumulate the batches');
    expect(refused.content).not.toContain('cannot succeed as it is');
  });

  it('"all" is the catalogue this producer last saw for THIS artifact, not the cap (AK#3)', async () => {
    fakePlayer(join(root, 'Builds', 'linux'), 'Game.x86_64', playerRecord);
    const tool = new RunPlayerTool();
    // Twelve rounds of five minutes do not fit; three do. With no previous
    // record, "all" is the cap.
    const cap = await tool.execute({ sessions: 'all', deadlineSeconds: 300 }, { projectPath: root } as never);
    expect(cap.isError).toBe(true);
    expect(cap.content).toContain('12 session(s) at 300 s');
    expect(cap.content).toContain('Ask for sessions "1-8"');
    // A run leaves the record (catalogue 3) beside the artifact it launched…
    const first = await tool.execute({ deadlineSeconds: 5 }, { projectPath: root } as never);
    expect(first.isError).toBe(false);
    const captureDir = join(root, PLAYER_CAPTURE_SUBDIR);
    expect(previousCatalogue(captureDir, join(root, 'Builds', 'linux', 'Game.x86_64'))).toBe(3);
    expect(previousCatalogue(captureDir, join(root, 'Builds', 'other', 'Game.x86_64'))).toBeUndefined();
    // …so "all" at 300 s is three sessions, which fit, and the run happens.
    const admitted = await tool.execute({ sessions: 'all', deadlineSeconds: 300 }, { projectPath: root } as never);
    expect(admitted.isError).toBe(false);
    expect(admitted.content).toContain('PLAY-THROUGH OK');
    // A record measured on ANOTHER artifact says nothing about this one: cap.
    const other = fakePlayer(join(root, 'Builds', 'other'), 'Other.x86_64', playerRecord);
    const foreign = await tool.execute({ sessions: 'all', deadlineSeconds: 300, artifactPath: other }, { projectPath: root } as never);
    expect(foreign.isError).toBe(true);
    expect(foreign.content).toContain('12 session(s) at 300 s');
  });

  it('a rebuilt artifact at the SAME path is budgeted as the cap until measured; the same bytes keep their catalogue (Codex round 5 #10)', async () => {
    const exe = fakePlayer(join(root, 'Builds', 'linux'), 'Game.x86_64', playerRecord);
    const tool = new RunPlayerTool();
    const captureDir = join(root, PLAYER_CAPTURE_SUBDIR);
    // A run leaves the catalogue (3) bound to the bytes it launched…
    const first = await tool.execute({ deadlineSeconds: 5 }, { projectPath: root } as never);
    expect(first.isError).toBe(false);
    expect(previousCatalogue(captureDir, exe)).toBe(3);
    const sidecar = JSON.parse(readFileSync(join(captureDir, 'player-run.json'), 'utf8')) as Record<string, unknown>;
    expect(sidecar['artifactPath']).toBe(exe);
    expect(sidecar['artifactSha256']).toBe(artifactDigest(exe));
    expect(sidecar['sessionCount']).toBe(3);
    // …and the same bytes, touched but unchanged, keep it: "all" at 300 s is
    // three sessions, which fit.
    writeFileSync(exe, readFileSync(exe));
    expect(previousCatalogue(captureDir, exe)).toBe(3);
    const same = await tool.execute({ sessions: 'all', deadlineSeconds: 300 }, { projectPath: root } as never);
    expect(same.isError).toBe(false);
    expect(same.content).toContain('PLAY-THROUGH OK');
    // A REBUILD AT THE SAME PATH is another game: its catalogue is unknown,
    // so "all" is the cap again — twelve at 300 s, refused with the batch
    // that fits — not the three the old bytes reported.
    appendFileSync(exe, '# rebuilt: a different game at the same path\n');
    expect(previousCatalogue(captureDir, exe)).toBeUndefined();
    const rebuilt = await tool.execute({ sessions: 'all', deadlineSeconds: 300 }, { projectPath: root } as never);
    expect(rebuilt.isError).toBe(true);
    expect(rebuilt.content).toContain('12 session(s) at 300 s');
    expect(rebuilt.content).toContain('Ask for sessions "1-8"');
    // Once the rebuilt bytes have been measured, THEIR catalogue counts.
    const measured = await tool.execute({ deadlineSeconds: 5 }, { projectPath: root } as never);
    expect(measured.isError).toBe(false);
    expect(previousCatalogue(captureDir, exe)).toBe(3);
    // A sidecar with no digest (written before the digest was recorded) binds nothing: cap.
    writeFileSync(join(captureDir, 'player-run.json'), JSON.stringify({ artifactPath: exe }));
    expect(previousCatalogue(captureDir, exe)).toBeUndefined();
  });

  it('counts "all" as min(cap, catalogue) only when a catalogue is known', () => {
    expect(countRequestedSessions('all', 12, 3)).toBe(3);
    expect(countRequestedSessions('all', 12, 40)).toBe(12);
    expect(countRequestedSessions('all', 12, undefined)).toBe(12);
    expect(countRequestedSessions('1-5', 12, 3)).toBe(5);
  });
});

/**
 * THE RECEIPT FOR THE RUN THE CALLER ASKED FOR.
 *
 * Strada.Brain issues a run id before it dispatches and validates a receipt
 * afterwards. The player path returned none, so a correct play-through could
 * never be admitted — the coordinator's own receiver answered "the record
 * names no artifact digest" for every real run (Codex 2026-09-13 AH#6).
 */
describe('the evidence receipt', () => {
  const identified = {
    ...playerRecord,
    sessionCount: 1,
    sessions: [{
      index: 1, requestedIndex: 1, observedIndex: 1, identityVerified: true, identitySource: 'active-session',
      startAccepted: true, phasesSeen: ['Playing', 'Won'], actions: 9, outcome: 'Won', reachedOutcome: true, seconds: 4.0,
    }],
  };
  const receiptOf = (content: string): Record<string, unknown> => {
    const fenced = /```strada-evidence\n([\s\S]*?)\n```/.exec(content);
    expect(fenced).not.toBeNull();
    return JSON.parse(fenced![1]!) as Record<string, unknown>;
  };

  it('names the run, the artifact as this process measured it, and every identified session', async () => {
    const artifact = join(root, 'Builds', 'linux', 'Game.x86_64');
    fakePlayer(join(root, 'Builds', 'linux'), 'Game.x86_64', identified);
    const result = await new RunPlayerTool().execute(
      { deadlineSeconds: 5, evidenceRunId: 'run-abc', evidenceTarget: 'StandaloneLinux64' },
      { projectPath: root } as never,
    );

    const receipt = receiptOf(result.content);
    expect(receipt).toMatchObject({
      schemaVersion: 1,
      runId: 'run-abc',
      kind: 'playthrough',
      medium: 'player',
      execution: { completed: true, exitCode: 0, timedOut: false },
      sessionCount: 1,
    });
    // The digest is of the artifact THIS process read, not a string the
    // caller passed in: the same bytes hash the same both sides.
    expect(receipt['artifactSha256']).toBe(artifactDigest(artifact));
    expect(receipt['target']).toBe('StandaloneLinux64');
    expect(receipt['sessions']).toEqual([{
      requestedIndex: 1, index: 1, observedIndex: 1, identityVerified: true,
      identitySource: 'active-session', actions: 9, outcome: 'Won', reachedOutcome: true, seconds: 4,
    }]);
  });

  it('a session whose identity the runner never measured is left out rather than filled in', async () => {
    // playerRecord's session carries neither requestedIndex nor
    // identityVerified — an older runner. Inventing either would hand the
    // receiver a verified session nobody verified.
    fakePlayer(join(root, 'Builds', 'linux'), 'Game.x86_64', playerRecord);
    const result = await new RunPlayerTool().execute(
      { deadlineSeconds: 5, evidenceRunId: 'run-old' },
      { projectPath: root } as never,
    );
    expect(receiptOf(result.content)['sessions']).toEqual([]);
  });

  it('a player killed at the deadline is not a player that completed', async () => {
    // `completed: true, timedOut: false` used to be written as literals, so a
    // receipt for a player this process SIGKILLed claimed a normal end
    // (Codex 2026-09-13 AH#9). Measured at the source instead.
    const dir = join(root, 'Builds', 'linux');
    mkdirSync(dir, { recursive: true });
    const exe = join(dir, 'Game.x86_64');
    writeFileSync(exe, '#!/bin/sh\nsleep 30\n');
    chmodSync(exe, 0o755);
    expect(await runPlayerProcess(exe, [], 150)).toMatchObject({ timedOut: true, completed: false });
    // …and a player that exits on its own did complete, whatever its code.
    writeFileSync(exe, '#!/bin/sh\nexit 42\n');
    chmodSync(exe, 0o755);
    expect(await runPlayerProcess(exe, [], 10_000)).toEqual({ exitCode: 42, timedOut: false, completed: true });
    // A binary that cannot be spawned completed nothing either.
    expect(await runPlayerProcess(join(dir, 'absent'), [], 10_000)).toMatchObject({ completed: false, exitCode: -1 });
  });

  it('binds the verdict FILE the reader will judge from (Codex 2026-09-13 AJ#12)', async () => {
    // Strada.Brain judges the delivery from that file — its frame rate, its
    // frames, its errors — and the receipt said nothing about it, so an
    // admitted receipt authenticated no part of the measurement consumed.
    fakePlayer(join(root, 'Builds', 'linux'), 'Game.x86_64', playerRecord);
    const result = await new RunPlayerTool().execute(
      { deadlineSeconds: 5, evidenceRunId: 'run-v1' },
      { projectPath: root } as never,
    );
    const receipt = receiptOf(result.content);
    const payload = receipt['payload'] as Record<string, unknown>;
    expect(String(payload['verdictPath'])).toBe(join(PLAYER_CAPTURE_SUBDIR, 'playthrough-verdict.json'));
    // The digest is OF THE FILE ON DISK: the reader can check what it read.
    const onDisk = readFileSync(join(root, PLAYER_CAPTURE_SUBDIR, 'playthrough-verdict.json'), 'utf8');
    expect(payload['verdictSha256']).toBe(createHash('sha256').update(onDisk).digest('hex'));
    // …and an edited verdict no longer matches its receipt.
    writeFileSync(join(root, PLAYER_CAPTURE_SUBDIR, 'playthrough-verdict.json'), onDisk.replace('"ok": true', '"ok": false'));
    const edited = readFileSync(join(root, PLAYER_CAPTURE_SUBDIR, 'playthrough-verdict.json'), 'utf8');
    expect(createHash('sha256').update(edited).digest('hex')).not.toBe(payload['verdictSha256']);
  });

  it('the verdict FILE names the run it answers — the id the caller issued (Strada.Brain plan 1.3)', async () => {
    fakePlayer(join(root, 'Builds', 'linux'), 'Game.x86_64', playerRecord);
    await new RunPlayerTool().execute({ deadlineSeconds: 5, evidenceRunId: 'run-v1' }, { projectPath: root } as never);
    const onDisk = JSON.parse(readFileSync(join(root, PLAYER_CAPTURE_SUBDIR, 'playthrough-verdict.json'), 'utf8')) as { runId?: unknown };
    expect(onDisk.runId).toBe('run-v1');
    // No id issued, none invented.
    await new RunPlayerTool().execute({ deadlineSeconds: 5 }, { projectPath: root } as never);
    const unissued = JSON.parse(readFileSync(join(root, PLAYER_CAPTURE_SUBDIR, 'playthrough-verdict.json'), 'utf8')) as { runId?: unknown };
    expect(unissued.runId).toBeUndefined();
  });

  it('an ABSENT observation is not a zero one (Codex 2026-09-13 AI#7)', () => {
    // A game that registers no IActiveSession has nothing to observe the
    // session; the runner says so with a negative index. Carrying that as
    // zero made the receipt claim "identity accepted" and "no session
    // running" at once, which every receiver read as a contradiction.
    const verdict = (sessions: unknown) => ({ record: { sessionCount: 1, sessions }, ok: true } as never);
    const read = (text: string) => JSON.parse(/```strada-evidence\n([\s\S]*?)\n```/.exec(text)![1]!) as Record<string, unknown>;
    const session = (observedIndex: number) => [{
      index: 1, requestedIndex: 1, observedIndex, identityVerified: true, identitySource: 'start-acceptance',
      startAccepted: true, phasesSeen: ['Playing'], actions: 7, outcome: 'Won', reachedOutcome: true, seconds: 3,
    }];
    const process_ = { exitCode: 0, timedOut: false, completed: true };

    const unobserved = read(playerReceipt({ runId: 'r' }, root, join(root, 'nothing'), process_, verdict(session(-1))));
    expect((unobserved['sessions'] as Array<Record<string, unknown>>)[0]).not.toHaveProperty('observedIndex');
    // …and a service that DID report zero — no session running — is carried,
    // because that is an observation (Codex 2026-09-12 AA#3).
    const reportedZero = read(playerReceipt({ runId: 'r' }, root, join(root, 'nothing'), process_, verdict(session(0))));
    expect((reportedZero['sessions'] as Array<Record<string, unknown>>)[0]!['observedIndex']).toBe(0);
  });

  it('composes what was measured: a timeout, a session played under another index, an absent catalogue', () => {
    const verdict = (record: Record<string, unknown> | null) => ({ record, ok: true } as never);
    const read = (text: string) => JSON.parse(/```strada-evidence\n([\s\S]*?)\n```/.exec(text)![1]!) as Record<string, unknown>;

    // A player killed at the deadline. The end-to-end deadline is minutes
    // long, so the composition is measured here.
    const killed = read(playerReceipt({ runId: 'r' }, root, join(root, 'nothing'), { exitCode: -1, timedOut: true, completed: false }, verdict(null)));
    expect(killed['execution']).toEqual({ completed: false, exitCode: -1, timedOut: true });

    // ASKED FOR 2, PLAYED 1: the receipt must say both, or the receiver
    // cannot see the substitution.
    const swapped = read(playerReceipt({ runId: 'r' }, root, join(root, 'nothing'), { exitCode: 0, timedOut: false, completed: true }, verdict({
      sessionCount: 2,
      sessions: [{ index: 1, requestedIndex: 2, identityVerified: true, startAccepted: true, phasesSeen: [], actions: 3, outcome: 'Won', reachedOutcome: true, seconds: 2 }],
    })));
    expect(swapped['sessions']).toEqual([
      { requestedIndex: 2, index: 1, identityVerified: true, actions: 3, outcome: 'Won', reachedOutcome: true, seconds: 2 },
    ]);

    // A game that registers no catalog reports -1; the receipt claims no
    // catalogue at all rather than a negative one.
    const noCatalog = read(playerReceipt({ runId: 'r' }, root, join(root, 'nothing'), { exitCode: 0, timedOut: false, completed: true }, verdict({ sessionCount: -1 })));
    expect(noCatalog['target']).toBeUndefined();
    expect(noCatalog['sessionCount']).toBeUndefined();
    expect(read(playerReceipt({ runId: 'r' }, root, join(root, 'nothing'), { exitCode: 0, timedOut: false, completed: true }, verdict({ sessionCount: 0 })))['sessionCount']).toBe(0);
  });

  it('says nothing at all when no run id was issued', async () => {
    fakePlayer(join(root, 'Builds', 'linux'), 'Game.x86_64', identified);
    const result = await new RunPlayerTool().execute({ deadlineSeconds: 5 }, { projectPath: root } as never);
    expect(result.content).not.toContain('strada-evidence');
  });
});
