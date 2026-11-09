/**
 * task-335 — a child-process stand-in for `launchAgent`'s in-process tests of the headless work run and the time
 * bound (`spec-016` §3.3 steps 14–15), the shape of `test/agent/launch-process.test.ts`'s `FakeChild` with what
 * those cases need besides: a `stdout` stream (a headless child's stdout is piped and drained, D6), and a
 * declared answer to each signal — `exit` (ended by it, the default), `ignore` (it keeps running), or a code it
 * exits with (it traps the signal). A signal is raised with `process.emit`, which runs the listeners only: the
 * Jest process is never signalled.
 *
 * task-355 (`bug-516`): an optional `pid`, so a headless launch on POSIX takes the process-group path
 * (`LaunchHost.signalGroup`); a child built without one has no `pid`, and the launch signals it with `kill`.
 *
 * {@link settle} ends a child still running, so a test that fails before its child exits does not leave
 * `launchAgent` waiting, with its signal listeners installed, for the rest of the worker.
 */
import type { ChildProcess, SpawnOptions } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';

import type { SpawnAgent } from '../../../src/agent';

/** What the child does when a signal reaches it. */
export type SignalAnswer = 'exit' | 'ignore' | number;

export class FakeChild extends EventEmitter {
  exitCode: number | null = null;
  signalCode: NodeJS.Signals | null = null;
  readonly killed: NodeJS.Signals[] = [];
  readonly stdout = new PassThrough();
  /** The process id the launch reads for the process-group path (task-355); absent, as a `ChildProcess` that failed to spawn. */
  readonly pid: number | undefined;
  constructor(
    private readonly answers: Partial<Record<NodeJS.Signals, SignalAnswer>> = {},
    pid?: number,
  ) {
    super();
    this.pid = pid;
    setImmediate(() => this.emit('spawn'));
  }
  /** Whether it is still running. */
  get running(): boolean {
    return this.exitCode === null && this.signalCode === null;
  }
  /** End by itself with `code`, as an agent that exits does. */
  finish(code: number): void {
    if (!this.running) return;
    this.exitCode = code;
    this.stdout.end();
    this.emit('exit', code, null);
    this.emit('close', code, null);
  }
  kill(signal: NodeJS.Signals = 'SIGTERM'): boolean {
    this.killed.push(signal);
    const answer = this.answers[signal] ?? 'exit';
    if (answer === 'ignore') return true;
    setImmediate(() => {
      if (!this.running) return;
      if (typeof answer === 'number') {
        this.finish(answer);
        return;
      }
      this.signalCode = signal;
      this.stdout.end();
      this.emit('exit', null, signal);
      this.emit('close', null, signal);
    });
    return true;
  }
}

/** A `spawn` that hands out `child` and keeps the options it was called with. */
export function spawnInto(child: FakeChild): { spawn: SpawnAgent; calls: { command: string; args: readonly string[]; options: SpawnOptions }[] } {
  const calls: { command: string; args: readonly string[]; options: SpawnOptions }[] = [];
  return {
    calls,
    spawn: (command, args, options) => {
      calls.push({ command, args, options });
      return child as unknown as ChildProcess;
    },
  };
}

/** One tick of the event loop: the child has reported `spawn`. */
export const tick = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

/** End `child` if it still runs, then wait for `run`: no test leaves a launch pending. */
export async function settle<T>(child: FakeChild, run: Promise<T>): Promise<T> {
  child.finish(0);
  return run;
}
