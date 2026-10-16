/**
 * task-285 (`bug-378`, AC 2) — the REQ-PERF-02 report is written by `reportLatency` (`test/core/helpers/latency.ts`)
 * through `process.stdout.write`, not `console.log`, and only when `WINGFOIL_LATENCY_REPORT=1` (approver rulings D1,
 * D2, 2026-10-16): jest's agent reporter drops a passing suite's console output once the pass runs two or more files,
 * while a direct stdout write reaches the log whatever reporter jest picks. The text written is exactly
 * `latencyReport(...)` and a newline, the format `test/release-health/latency-report.test.ts` pins to the reader.
 * Synthetic samples only: nothing is spawned and nothing is timed.
 *
 * It also pins the suite itself, `test/cli/command-latency.test.ts`, by its code (imports and comments removed, as
 * `test/core/latency-budget-placement.test.ts` reads a suite): it reports through one `reportLatency(` call, never
 * through `console.`, and leaves the opt-in check to the helper.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

import { latencyReport, reportLatency, type LoadWindow, type MarginalLatencySamples } from './helpers/latency';

const RUNS = 25;
const flat = (value: number): number[] => Array.from({ length: RUNS }, () => value);
const COMMANDS = ['memory search', 'dna show', 'memory history'];
const LOAD: LoadWindow = { before: { oneMinute: 1.5, fiveMinute: 2 }, after: { oneMinute: 1.75, fiveMinute: 2.1 } };
const MEASURED: MarginalLatencySamples = { floor: flat(200), total: [300, 250, 420].map(flat), marginal: [100, 50, 220].map(flat) };
const EXPECTED = `${latencyReport(MEASURED, COMMANDS, LOAD)}\n`;

describe('reportLatency writes the REQ-PERF-02 report through an injected writer, opt-in by WINGFOIL_LATENCY_REPORT (task-285 AC 2, D2)', () => {
  it('with WINGFOIL_LATENCY_REPORT=1: writes latencyReport(...) and a newline exactly once, and returns true', () => {
    const write = jest.fn();
    expect(reportLatency(MEASURED, COMMANDS, LOAD, { WINGFOIL_LATENCY_REPORT: '1' }, write)).toBe(true);
    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith(EXPECTED);
  });

  it.each([
    ['unset', {}],
    ['0', { WINGFOIL_LATENCY_REPORT: '0' }],
    ['empty', { WINGFOIL_LATENCY_REPORT: '' }],
  ])('with WINGFOIL_LATENCY_REPORT %s: writes nothing and returns false', (_label, env) => {
    const write = jest.fn();
    expect(reportLatency(MEASURED, COMMANDS, LOAD, env, write)).toBe(false);
    expect(write).not.toHaveBeenCalled();
  });
});

describe('reportLatency\'s default writer is process.stdout.write, never console.log (task-285 AC 2, D1)', () => {
  let stdoutWrite: jest.SpyInstance;
  let consoleLog: jest.SpyInstance;

  beforeEach(() => {
    stdoutWrite = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    consoleLog = jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    stdoutWrite.mockRestore();
    consoleLog.mockRestore();
  });

  it('with an explicit opt-in env: the report goes to process.stdout.write, console.log is never called', () => {
    const written = reportLatency(MEASURED, COMMANDS, LOAD, { WINGFOIL_LATENCY_REPORT: '1' });
    const calls = stdoutWrite.mock.calls.map((call: unknown[]) => call[0]);
    const logged = consoleLog.mock.calls.length;
    stdoutWrite.mockRestore();
    consoleLog.mockRestore();
    expect(written).toBe(true);
    expect(calls).toEqual([EXPECTED]);
    expect(logged).toBe(0);
  });

  it('with the default env: it reads process.env.WINGFOIL_LATENCY_REPORT', () => {
    const saved = process.env['WINGFOIL_LATENCY_REPORT'];
    try {
      process.env['WINGFOIL_LATENCY_REPORT'] = '1';
      const on = reportLatency(MEASURED, COMMANDS, LOAD);
      delete process.env['WINGFOIL_LATENCY_REPORT'];
      const off = reportLatency(MEASURED, COMMANDS, LOAD);
      const calls = stdoutWrite.mock.calls.map((call: unknown[]) => call[0]);
      stdoutWrite.mockRestore();
      expect({ on, off, calls }).toEqual({ on: true, off: false, calls: [EXPECTED] });
    } finally {
      if (saved === undefined) delete process.env['WINGFOIL_LATENCY_REPORT'];
      else process.env['WINGFOIL_LATENCY_REPORT'] = saved;
    }
  });
});

/** A suite's source without its import statements and comments (as `latency-budget-placement.test.ts` reads it). */
function codeOnly(source: string): string {
  return source
    .replace(/^import[\s\S]*?from\s+['"][^'"]+['"];?$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:\\])\/\/.*$/gm, '$1');
}

describe('test/cli/command-latency.test.ts reports through reportLatency only (task-285 AC 2, textual pin)', () => {
  const code = codeOnly(readFileSync(join(__dirname, '..', 'cli', 'command-latency.test.ts'), 'utf-8'));

  it('calls reportLatency( exactly once', () => {
    expect([...code.matchAll(/\breportLatency\(/g)]).toHaveLength(1);
  });

  it('calls no console. method', () => {
    expect(code).not.toMatch(/\bconsole\./);
  });

  it('leaves the WINGFOIL_LATENCY_REPORT opt-in to the helper (D2)', () => {
    expect(code).not.toContain('WINGFOIL_LATENCY_REPORT');
  });
});
