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
  if (exceptions.length > 0) return { passed: false, reason: "threw" };
  return { passed: true, reason: "ok" };
}
