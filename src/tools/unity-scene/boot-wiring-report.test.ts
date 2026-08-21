import { describe, expect, it } from 'vitest';

import { buildBootSmokeTest } from './boot-smoke-test.js';

const { source } = buildBootSmokeTest('Main');

describe('the boot smoke test reports what the container holds', () => {
  it('asks the locator about every injected dependency', () => {
    expect(source).toContain('ReportInjectionWiring');
    expect(source).toContain('InjectAttribute');
    expect(source).toContain('IsRegistered');
    expect(source).toContain('NOT REGISTERED');
  });

  it('uses only members Strada.Core actually exposes', () => {
    // IServiceLocator, not IContainer: GameBootstrapper.Services is the former,
    // and naming the wrong one would break every generated smoke test.
    expect(source).toContain('Strada.Core.Modules.IServiceLocator');
    expect(source).not.toContain('Strada.Core.DI.IContainer services');
    expect(source).toContain('GameBootstrapper.Systems');
    expect(source).toContain('GetAllSystems()');
  });

  it('actually calls it from the test body', () => {
    // Defining the method proves nothing; the generated test has to run it.
    const body = source.slice(0, source.indexOf('private static void ReportInjectionWiring'));

    expect(body, 'the wiring report is defined but never invoked').toContain('ReportInjectionWiring();');
  });

  it('imports what the reflection needs', () => {
    expect(source).toContain('using System.Reflection;');
    expect(source).toContain('using Strada.Core.DI.Attributes;');
  });

  it('does not import System, which would make UnityEngine.Object ambiguous', () => {
    // Measured 2026-08-21: adding `using System;` here produced CS0104 on the
    // existing Object.FindFirstObjectByType call and broke the whole assembly.
    expect(source).not.toMatch(/^using System;$/mu);
    expect(source).toContain('System.Attribute.IsDefined');
  });

  it('reports rather than fails, because the framework allows a null injection', () => {
    const report = source.slice(source.indexOf('private static void ReportInjectionWiring'));
    const body = report.slice(0, report.indexOf('private static string Describe'));

    expect(body).not.toContain('Assert.');
  });
});
