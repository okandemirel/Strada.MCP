/**
 * Reading whether a Unity test run actually passed.
 *
 * Unity's test runner writes NUnit3 XML. The counts that decide the verdict sit
 * on the top-level <test-run> element; everything below it is per-case detail.
 *
 * Two traps this exists to avoid, both observed in this project:
 *
 * - Substring checks. `xml.includes("Passed")` is true for any run with a single
 *   passing case, so two failures out of three still read as clean.
 * - A run of nothing. `failed === 0` holds perfectly when zero tests executed,
 *   which is how "0 errors" has repeatedly been reported for builds where
 *   nothing compiled. The question is never how many failed; it is what ran.
 */

export interface TestRunOutcome {
  readonly result: string;
  readonly total: number;
  readonly passed: number;
  readonly failed: number;
  readonly skipped: number;
}

/** Counts from the top-level <test-run>, or null when no such element exists. */
export function parseTestRun(xml: string): TestRunOutcome | null {
  const element = /<test-run\b[^>]*>/.exec(xml)?.[0];
  if (!element) return null;

  const attr = (name: string): string | null =>
    new RegExp(`\\b${name}="([^"]*)"`).exec(element)?.[1] ?? null;
  const count = (name: string): number => Number.parseInt(attr(name) ?? '', 10) || 0;

  return {
    result: attr('result') ?? '',
    total: count('total'),
    passed: count('passed'),
    failed: count('failed'),
    skipped: count('skipped'),
  };
}

/** The names of failing cases, for a report that says which ones. */
export function failedTestNames(xml: string, limit = 20): string[] {
  const names: string[] = [];
  const caseRe = /<test-case\b[^>]*>/g;
  let match: RegExpExecArray | null;
  while ((match = caseRe.exec(xml)) !== null && names.length < limit) {
    const element = match[0];
    if (!/\bresult="(Failed|Error)"/.test(element)) continue;
    const name = /\bfullname="([^"]*)"/.exec(element)?.[1]
      ?? /\bname="([^"]*)"/.exec(element)?.[1];
    if (name) names.push(name);
  }
  return names;
}

export interface FailedTest {
  readonly name: string;
  /** The assertion's own message, which is where the reason lives. */
  readonly message?: string;
  /**
   * What the game printed while this test ran, when the runner captured it.
   *
   * An assertion says what was expected and what arrived. It cannot say what
   * the game was doing in between, and a state-machine failure — "the event
   * should have fired" — is unarguable without that. The results file carries
   * it; this parser used to read the message and discard the rest.
   */
  readonly output?: string;
}

/**
 * Failing cases with the reason each one gives.
 *
 * A name alone is not a diagnosis: "StradaBootSmokeTest.TheAssembledSceneBoots"
 * says a scene did not boot and nothing about why. The reason was already in
 * the results file — reading it required opening Unity by hand.
 */
export function failedTests(xml: string, limit = 20): FailedTest[] {
  const out: FailedTest[] = [];
  // Each chunk is one case and everything up to the next one, which is where
  // that case's <failure><message> sits.
  const chunks = xml.split('<test-case');
  for (const chunk of chunks.slice(1)) {
    if (out.length >= limit) break;
    const header = /^[^>]*>/.exec(chunk)?.[0] ?? '';
    if (!/\bresult="(Failed|Error)"/.test(header)) continue;
    const name = /\bfullname="([^"]*)"/.exec(header)?.[1] ?? /\bname="([^"]*)"/.exec(header)?.[1];
    if (!name) continue;
    const raw = /<message>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/message>/.exec(chunk)?.[1];
    const message = raw?.trim().replace(/\s+/gu, ' ').slice(0, 400);
    // The tail, not the head: a run that ends wrong ends with the lines that
    // explain it, and the opening frames of a play-mode test are boilerplate.
    const output = tailOfOutput(chunk);
    out.push({ name, ...(message ? { message } : {}), ...(output ? { output } : {}) });
  }
  return out;
}

/**
 * Whether a play-mode run counts as a pass.
 *
 * Three conditions, and the first is the one that keeps being forgotten: tests
 * must have executed. `failed === 0` is trivially true of a run that did
 * nothing, and "no PlayMode test assembly in the project" is exactly the state
 * a fresh generated project is in — so without this, the first verification of
 * every new game would report success having verified nothing.
 *
 * The third condition is that the game did not throw. A MonoBehaviour exception
 * that no assertion observes leaves every test green and the game broken.
 */
export function playmodeVerdict(
  outcome: TestRunOutcome | null,
  exceptions: readonly string[] = [],
): { passed: boolean; reason: "ok" | "no-results" | "nothing-ran" | "tests-failed" | "threw" } {
  if (outcome === null) return { passed: false, reason: "no-results" };
  if (outcome.total === 0) return { passed: false, reason: "nothing-ran" };
  if (outcome.failed > 0) return { passed: false, reason: "tests-failed" };
  // A run where every test was skipped satisfies total > 0 and failed === 0
  // while executing nothing — the same emptiness the total check was written to
  // catch, arriving through a different door. NUnit skips a whole assembly when
  // its constraints exclude the platform, so this is not a rare shape.
  if (outcome.passed === 0) return { passed: false, reason: "nothing-ran" };
  if (exceptions.length > 0) return { passed: false, reason: "threw" };
  return { passed: true, reason: "ok" };
}

/** The last lines a failing test printed, bounded so evidence stays readable. */
function tailOfOutput(chunk: string, maxLines = 12, maxChars = 800): string | undefined {
  const raw = /<output>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/output>/.exec(chunk)?.[1];
  const text = raw?.trim();
  if (!text) {
    return undefined;
  }
  // A frame-by-frame log repeats: the same line every Update until something
  // changes. Measured 2026-08-21: a failing test's twelve-line tail was the
  // same sentence twelve times, and the lines that would have shown what
  // preceded it had scrolled out. Collapsing runs of an identical line spends
  // the budget on distinct observations instead — and it was reading one of
  // these tails, seeing a line absent, that made me report a bug fixed when it
  // had only scrolled away.
  const lines = collapseRepeats(
    text.split('\n').map((l) => l.trimEnd()).filter((l) => l !== ''),
  );
  const tail = lines.slice(-maxLines).join('\n');
  return tail.length > maxChars ? tail.slice(-maxChars) : tail;
}

/** Consecutive identical lines become one, carrying how many times it repeated. */
function collapseRepeats(lines: readonly string[]): string[] {
  const out: string[] = [];
  let last: string | null = null;
  let count = 0;
  const flush = () => {
    if (last === null) return;
    out.push(count > 1 ? `${last}  (x${count})` : last);
  };
  for (const line of lines) {
    if (line === last) {
      count++;
      continue;
    }
    flush();
    last = line;
    count = 1;
  }
  flush();
  return out;
}
