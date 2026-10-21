---
id: "bug-116-help-help-reports-unknown-command-for-a-command-that-exists"
type: bug
title: "`wingfoil help help` reports `unknown command 'help'` at exit 2 — the exit code is right and the sentence is false, because Commander's built-in help command is not in its own command list"
status: triaged
severity: "low"
release-origin: "v0.2"
release: "v0.4"
feature: "P5.1"
contributor: ""
credit: ""
tmpl_version: 260703
---

## Summary

```
$ wingfoil help help
error: unknown command 'help'      exit 2
```

`help` is not unknown — `wingfoil help` works. Commander's built-in help command is not a member of
`this.commands`, so `_findCommand('help')` misses and the invocation falls through to the
`_dispatchSubcommand` branch that treats it as an incomplete invocation.

## Steps to Reproduce

The command above, on `task-103`'s build.

## Expected Behavior

Either `wingfoil help help` prints the help command's own help at exit 0, or it refuses with a message
that is true.

## Actual Behavior

It refuses with a message naming a command the tool has.

## Notes

**The exit code is right and the wording is wrong, which is an unusual split worth stating.**
Commander itself classifies this as incomplete — measured: `commander.help`, suggested `1` — so
`task-103`'s classification rule reaches the correct code by the correct route. What is false is only
the sentence, which is WingFoil's own.

**It is a regression in legibility and an improvement in contract, simultaneously.** Before
`task-103` this exited `1` silently with no `error:` line at all — a quiet wrong code. It is now a
loud wrong message. That is the better failure of the two, and it is still a failure.

**Do not fix it by special-casing the string `help`.** The general shape is that Commander's built-in
commands are invisible to `_findCommand`, so any future built-in would behave the same way. Whoever
takes this should decide whether the classifier consults Commander's built-ins, which is a question
about the discriminator `task-103` built rather than about this one word.

**Found by `task-103`'s reviewer.**

## Triage & Execution Notes

- triage (2026-09-25): **low**. One invocation nobody types by accident, now failing loudly instead of
  quietly. Filed because the message is false and because the underlying shape generalises to any
  Commander built-in.
