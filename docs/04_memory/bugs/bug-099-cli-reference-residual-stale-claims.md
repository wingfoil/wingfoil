---
id: "bug-099-cli-reference-residual-stale-claims"
type: bug
title: "`X_cli-cmds.md` still declares a `--dry-run` that does not exist, describes sync processes against a retired schema key, and repeats the `interactive or flag-based` claim in two more pillars"
status: in-progress
severity: "low"
release-origin: "v0.2"
release: "v0.3"
feature: "P5.1"
contributor: ""
credit: ""
tmpl_version: 260703
---

## Summary

`task-098` corrected the Pillar 2 rows of `docs/01_vision/X_cli-cmds.md` under `bug-090` and
`dl-082`. Three claims of the same kind survive in parts of the document that task did not own, plus
one residue on the CLI side of the same question.

1. **`--dry-run` is declared and does not exist.** The Global Options section lists it;
   `wingfoil --dry-run dna show project` → `error: unknown option '--dry-run'`, exit 1. `spec-008` §2's
   global-flag table does not list it either.
2. **The *Sync Process* paragraphs (Pillars 2, 3 and 4) describe unbuilt synchronisation** — and
   describe it against `tech-stack`, the fixed-key shape `spec-002` retired in favour of
   `stacks.technologies`. Same family as the example `task-098` replaced, in pillars it did not own.
3. **`(interactive or flag-based)` survives on `directive create` (Pillar 3) and `workflow create`
   (Pillar 4).** Measured: `wingfoil workflow --help` lists `list` as its only subcommand, so
   `workflow create` is not built at all; `wingfoil directive create` is built and exits 2 with
   `error: missing required argument: --name` rather than prompting. `task-098` established that the
   only command with a prompt branch is `init`.
4. **The CLI side of the same annotation question:** a subcommand's `--help` does not list `--format`,
   although the option works there. `wingfoil memory search --help` shows only `--tag`, `--status`,
   `--type`. Commander can surface global options in subcommand help. Until it does, the reference's
   nine `[--format json/yaml]` annotations read as a competing declaration rather than as a
   description of one global flag.

## Steps to Reproduce

Each measured against `main`'s build in a throwaway `wingfoil init --template Scrum` repository; the
commands are in `task-098`'s Execution Notes with their output.

## Expected Behavior

The approved CLI reference describes the shipped surface, or marks plainly what is not built. A flag
it declares exists. A key it names is in the schema. A subcommand's help lists the options that work
on it.

## Actual Behavior

Four claims that a reader would act on and find untrue, in a document whose `Status` is `Approved`.

## Notes

**Deliberately not absorbed into `task-098`.** Its scope was `bug-090` — the `dna set` grammar and the
rows `dl-082` moved — and `dl-082`'s own E3 warns that absorbing a change spanning ten rows and four
pillars "would silently widen the ruling". Items 2 and 3 live in Pillars 3 and 4; item 1 is a global
section; item 4 is code, not documentation.

**Item 3 has a second half worth separating when this is scheduled.** `workflow create` is not built,
so its row should say so the way `task-098` marked `dna infer` *Not built*. `directive create` **is**
built and simply does not prompt, so its row needs the `On interactivity` treatment instead. They read
as one defect and are two.

**Item 4 is a decision before it is a fix.** Surfacing globals in every subcommand's help is one
option; another is to stop annotating per-row in the reference and state the global flags once. The
second is what the implementation already does, and `spec-008` §2 already rules for it.

## Triage & Execution Notes

- triage (2026-09-24): **low**. Documentation drift in a document nobody reads to operate the tool
  today — the dogfooding config is hand-authored (`bug-075`). It rises the moment `v0.2` publishes and
  the reference becomes the thing a new user reads first, which is an argument for scheduling it into
  the `user-docs` phase rather than deferring it to v0.3.
- Found by `task-098` while executing every command in the rows it corrected.
