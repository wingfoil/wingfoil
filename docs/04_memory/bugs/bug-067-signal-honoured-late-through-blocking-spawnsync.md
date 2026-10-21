---
id: "bug-067-signal-honoured-late-through-blocking-spawnsync"
type: bug
title: "An interrupt delivered only to `publish:staging` waits out the blocking `spawnSync` npm step before teardown runs, so the operator sees nothing for tens of seconds and may escalate to SIGKILL — which does leak"
status: triaged
severity: "medium"
release-origin: "v0.2"
release: ""
feature: ""
contributor: ""
credit: ""
tmpl_version: 260703
---

## Summary

`run` in `scripts/publish-staging.cjs` executes every npm step through `spawnSync`, which blocks the
event loop for the child's whole lifetime. A signal handler cannot run while the loop is blocked, so
an interrupt delivered **only to the script** is queued and honoured when that step returns. Teardown
is correct when it finally runs — `task-083` fixed that — but the operator sees no response for as
long as the npm step takes, and the natural reaction to an unresponsive process is `kill -9`, which
runs no teardown at all and leaks exactly what `bug-059` was filed about.

## Steps to Reproduce

1. Start `npm run publish:staging -- --tarball <tgz>` under `setsid`, so the signal can be delivered
   to the script alone rather than to the process group.
2. Send `SIGINT` or `SIGTERM` to the script's own pid while a blocking npm step is running — the
   global install is the longest. This is the delivery shape `bug-059`'s own Steps to Reproduce use.
3. Observe that nothing is printed and the process does not exit until that npm step completes.

Measured twice on this machine, by two different agents: **44 seconds** during `npm install --global`
(`task-083` first pass), and **7 seconds** between a `SIGTERM` at t=10s and the process exiting at
t=17s (the second-pass review). Both runs then tore down correctly and left the machine clean.

## Expected Behavior

An interrupt is acknowledged promptly — either by forwarding the signal to the in-flight child so it
dies and the step returns, or by making the step non-blocking so the handler can run. The operator
should not have to guess whether the process is hung.

## Actual Behavior

Silence for the duration of the step, then a correct teardown. Nothing tells the operator that the
signal was received, so the observable behaviour is indistinguishable from a hang.

## Notes

**This is not a leak, and it must not be re-graded as one.** `task-083` closed the leak: when the
handler does run, teardown removes the npmrc first, stops the registry — including one still coming
up, via the `onSpawn` callback — and removes the work dir, then re-raises the signal so the process
dies with the conventional status. What remains is a **latency and legibility** defect whose danger
is entirely in what it provokes: `SIGKILL` cannot be handled, so an impatient escalation bypasses the
whole teardown and reproduces `bug-059`'s symptom through a path no code change to the handler can
cover.

The mitigations that already exist bound the exposure and should be weighed at triage rather than
rediscovered. An interactive `Ctrl-C` signals the whole process group, so the npm child dies on its
own and the step returns immediately — the second-pass review measured the group case at under a
second. CI cancellation likewise signals the group. The slow path is therefore the deliberate
single-process delivery, which is what an operator does with `kill -INT <pid>` and what a script
wrapping this one would do.

A fix touches `run`'s contract — forwarding the signal to the in-flight child, or moving to an async
spawn with an awaited exit — which is beyond what `task-083`'s acceptance criteria covered and why it
was proposed rather than smuggled in. `stopProcess` already implements a SIGTERM→SIGKILL escalation
toward a child and is the obvious shape to reuse.

Filed on the reviewer's recommendation at `task-083`'s second-pass approval, deliberately **before**
that task reached `done`: `bug-059` closes with it, so nothing else would have tracked this. The same
argument produced `task-085-retense-spec-015-sigint-sentence`, and leaving one proposal filed and the
other inside Execution Notes would be the inconsistency — a proposal in a done task's notes is what
nothing reschedules, which is the failure `bug-062` was opened about.

## Triage & Execution Notes

- triage (2026-09-22): **medium**. No leak and no data loss on the path as it stands; the severity is
  in the escalation it invites, and in an operator's reasonable conclusion that the tool has hung
  during the one procedure `dl-056` requires before a release tag. Not high, because the common
  deliveries — interactive Ctrl-C and CI cancellation — hit the whole group and respond in under a
  second.
- No fix task filed: it changes `run`'s contract, which wants a design decision rather than a patch,
  and v0.2 is closing. Natural v0.3 item.
