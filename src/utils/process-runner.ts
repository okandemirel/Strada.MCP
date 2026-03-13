import { spawn } from 'node:child_process';
import { sanitizeOutput } from '../security/sanitizer.js';

const SHELL_METACHAR_RE = /[;&|`$(){}[\]<>!\\]/;

export function sanitizeArg(arg: string): string {
  if (SHELL_METACHAR_RE.test(arg)) {
    throw new Error(`Argument contains shell metacharacter: "${arg}"`);
  }
  return arg;
}

export interface ProcessResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export async function runProcess(
  command: string,
  args: string[],
  options: { timeout: number; cwd?: string },
): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let settled = false;

    child.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
    });
    child.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        child.kill('SIGKILL');
        reject(new Error(`Process "${command}" timed out after ${options.timeout}ms`));
      }
    }, options.timeout);

    child.on('close', (code) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve({
          stdout: sanitizeOutput(stdout),
          stderr: sanitizeOutput(stderr),
          exitCode: code ?? 1,
        });
      }
    });

    child.on('error', (err) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(err);
      }
    });
  });
}
