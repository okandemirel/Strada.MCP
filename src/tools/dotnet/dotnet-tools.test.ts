import { describe, it, expect } from 'vitest';
import { parseMSBuildOutput, DotnetBuildTool } from './dotnet-build.js';
import { parseTestOutput, DotnetTestTool } from './dotnet-test.js';
import type { ToolContext } from '../tool.interface.js';

describe('Dotnet Tools', () => {
  const ctx: ToolContext = {
    projectPath: '/tmp/fake-project',
    workingDirectory: '/tmp/fake-project',
    readOnly: false,
    unityBridgeConnected: false,
  };

  describe('parseMSBuildOutput', () => {
    it('should parse error lines', () => {
      const output = `
Build started...
Assets/Scripts/Player.cs(10,5): error CS1002: ; expected
Build FAILED.
`;
      const diagnostics = parseMSBuildOutput(output);
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].type).toBe('error');
      expect(diagnostics[0].code).toBe('CS1002');
      expect(diagnostics[0].message).toBe('; expected');
      expect(diagnostics[0].file).toBe('Assets/Scripts/Player.cs');
      expect(diagnostics[0].line).toBe(10);
      expect(diagnostics[0].column).toBe(5);
    });

    it('should parse warning lines', () => {
      const output = `
Assets/Scripts/Enemy.cs(3,12): warning CS0219: The variable 'x' is assigned but its value is never used
Build succeeded.
`;
      const diagnostics = parseMSBuildOutput(output);
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].type).toBe('warning');
      expect(diagnostics[0].code).toBe('CS0219');
    });

    it('should parse multiple diagnostics', () => {
      const output = `
Assets/A.cs(1,1): error CS0000: first error
Assets/B.cs(2,3): warning CS0001: first warning
Assets/C.cs(4,5): error CS0002: second error
`;
      const diagnostics = parseMSBuildOutput(output);
      expect(diagnostics).toHaveLength(3);
      expect(diagnostics.filter((d) => d.type === 'error')).toHaveLength(2);
      expect(diagnostics.filter((d) => d.type === 'warning')).toHaveLength(1);
    });

    it('should return empty for clean output', () => {
      const output = 'Build succeeded.\n    0 Warning(s)\n    0 Error(s)';
      const diagnostics = parseMSBuildOutput(output);
      expect(diagnostics).toHaveLength(0);
    });
  });

  describe('parseTestOutput', () => {
    it('should parse Passed! summary', () => {
      const output = `
Test run for /app/bin/Tests.dll (.NETCoreApp,Version=v8.0)
Starting test execution, please wait...
Passed!  - Failed:     0, Passed:     5, Skipped:     1, Total:     6
`;
      const summary = parseTestOutput(output);
      expect(summary).not.toBeNull();
      expect(summary!.total).toBe(6);
      expect(summary!.passed).toBe(5);
      expect(summary!.failed).toBe(0);
      expect(summary!.skipped).toBe(1);
    });

    it('should parse Failed! summary', () => {
      const output = `
Failed!  - Failed:     2, Passed:     3, Skipped:     0, Total:     5
`;
      const summary = parseTestOutput(output);
      expect(summary).not.toBeNull();
      expect(summary!.total).toBe(5);
      expect(summary!.passed).toBe(3);
      expect(summary!.failed).toBe(2);
      expect(summary!.skipped).toBe(0);
    });

    it('should parse alternative format', () => {
      const output = 'Total tests: 10. Passed: 8. Failed: 1. Skipped: 1.';
      const summary = parseTestOutput(output);
      expect(summary).not.toBeNull();
      expect(summary!.total).toBe(10);
      expect(summary!.passed).toBe(8);
      expect(summary!.failed).toBe(1);
      expect(summary!.skipped).toBe(1);
    });

    it('should return null for unparseable output', () => {
      const summary = parseTestOutput('Some random output without test results');
      expect(summary).toBeNull();
    });
  });

  describe('DotnetBuildTool', () => {
    it('should have correct metadata', () => {
      const tool = new DotnetBuildTool();
      expect(tool.name).toBe('dotnet_build');
      expect(tool.metadata.category).toBe('dotnet');
      expect(tool.metadata.readOnly).toBe(false);
      expect(tool.metadata.requiresBridge).toBe(false);
    });

    it('should reject in read-only mode', async () => {
      const tool = new DotnetBuildTool();
      const result = await tool.execute({}, { ...ctx, readOnly: true });
      expect(result.isError).toBe(true);
      expect(result.content).toContain('read-only');
    });
  });

  describe('DotnetTestTool', () => {
    it('should have correct metadata', () => {
      const tool = new DotnetTestTool();
      expect(tool.name).toBe('dotnet_test');
      expect(tool.metadata.category).toBe('dotnet');
      expect(tool.metadata.readOnly).toBe(false);
    });

    it('should reject in read-only mode', async () => {
      const tool = new DotnetTestTool();
      const result = await tool.execute({}, { ...ctx, readOnly: true });
      expect(result.isError).toBe(true);
      expect(result.content).toContain('read-only');
    });
  });
});
