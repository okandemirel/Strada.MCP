import { describe, expect, it } from 'vitest';

import { buildBootSmokeTest } from './boot-smoke-test.js';

/**
 * The wiring report must not go quiet exactly when the wiring is broken.
 *
 * Measured 2026-08-21, run 37: a playmode run failed with "IGameFlowService
 * should be registered. Expected: not null But was: null" and the report that
 * exists to answer precisely that question printed nothing at all. Two silent
 * exits did it — a bare `return` when the bootstrapper's statics were null, and
 * a loop over GetAllSystems() that says nothing when the runner holds no
 * systems. Both are the states worth reporting; a report that only speaks when
 * everything is fine is decoration.
 */

const { source } = buildBootSmokeTest('Main');
const report = source.slice(source.indexOf('private static void ReportInjectionWiring'));
const body = report.slice(0, report.indexOf('private static string Describe'));

describe('the wiring report speaks when the wiring is broken', () => {
  it('says which bootstrapper static was missing instead of returning in silence', () => {
    // Returning is fine. Returning without saying why is not, so the check is
    // that something is logged BEFORE the first return leaves the method.
    const beforeFirstReturn = body.slice(0, body.indexOf('return;'));

    expect(beforeFirstReturn, 'the method can exit before it reports anything').toContain(
      '[StradaWiring]',
    );
    expect(beforeFirstReturn).toContain('GameBootstrapper.Services is null');
    expect(beforeFirstReturn).toContain('GameBootstrapper.Systems is null');
  });

  it('reports a runner that holds no systems at all', () => {
    // An empty GetAllSystems() means nothing will ever tick — the loop body
    // never runs, so without this the whole report is one blank line.
    expect(body).toMatch(/no systems|nothing registered|GetAllSystems\(\)[^;]*Count|systemCount/iu);
  });

  it('still only reports, never asserts', () => {
    // Strada.Core permits a null injection by design; this is evidence, not a
    // verdict.
    expect(body).not.toContain('Assert.');
  });
});
