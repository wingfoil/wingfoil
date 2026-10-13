---
id: dl-138-wingfoil-consumes-templates-configurations-methodologies-and-directives-from-a-remote-versioned-source
type: decision-log
title: "WingFoil consumes templates, configurations, methodologies and directives from a remote, versioned source"
status: ready
context: "ad-hoc"            # optional — short label for the context, e.g. "retrospective", "planning", "ad-hoc"
release: "v0.4"            # optional — implementation release this DL is assigned to (stamped at release-planning/build-backlog, dl-016), e.g. "v0.1"
contributor: ""        # optional — who originated this contribution, if not the git author (dl-020); credited for AI-generated work derived from it
credit: ""             # optional — free-text credit note (dl-020)
tmpl_version: 260703   # Orignal template version
tags: ["governance","templates","init","update"]
reported_by: ["svc-018-github-repository-wingfoil-templates-a-consumer-project-and-its-feedback-inbox/F-003@6b84e18f4195533b329320c08a96f7b2b3151e38", "svc-018-github-repository-wingfoil-templates-a-consumer-project-and-its-feedback-inbox/F-004@6b84e18f4195533b329320c08a96f7b2b3151e38", "svc-018-github-repository-wingfoil-templates-a-consumer-project-and-its-feedback-inbox/F-005@6b84e18f4195533b329320c08a96f7b2b3151e38", "svc-018-github-repository-wingfoil-templates-a-consumer-project-and-its-feedback-inbox/F-027@a15b053a7174fd5fa87d472cc394c7f8ad40b0ce", "svc-018-github-repository-wingfoil-templates-a-consumer-project-and-its-feedback-inbox/F-029@a15b053a7174fd5fa87d472cc394c7f8ad40b0ce"]   # optional — consumer feedback notes this element answers, as provenance only (dl-163 S3c)
---

## Context

**Today every template WingFoil installs ships inside the npm package.**
- `wingfoil init --template Scrum|Kanban` scaffolds the configuration from the package's own
  template definitions (`templateScaffold`, `src/core/init.ts`).
- The P3.8 directive templates are copied into `.wingfoil/directives/built-in/`, under the
  REQ-SEC-10 integrity check.
- REQ-SEC-07 ("Immutable built-in assets") keys removability on the `built-in/` vs `custom/`
  distinction.

There is no way to take a template, a methodology, a workflow, a directive or a starting DNA from
anywhere else, and no way to update one after `init`.

**The approver has created a separate public repository** to hold WingFoil's templates and starting
configurations: methodologies, workflows, directives, starting DNA. It was empty when this decision
was taken, and its design was under discussion. Its purpose:
- to version and release that content independently of the WingFoil tool;
- to allow third-party sources, for example a company's own templates.

It is **`wingfoil/wingfoil-templates`** (https://github.com/wingfoil/wingfoil-templates), registered here as
`svc-018`; the name is recorded on 2026-10-13 (Action 1).

**v0.4 already plans the content side of this.**
- The reference workflow templates P4.18–P4.20 (Scrum, Kanban, Lean Inception, Trunk-Based, with
  expansion and customisation) moved to `minor-v0.4`.
- That release also carries the idea of composable **methodology packs**: directives, workflows and
  configuration per methodology, selectable at `init` and addable afterwards.

This decision changes where that content lives and how it reaches a project over time.

**The impact is not limited to `init`.** It reaches how WingFoil governance is first set up in a
host project and how it is **updated afterwards**. A project initialised from a template must be
able to receive a later version of that template, methodology or directive, without losing its
local customisations and without breaking determinism.

## Decision

The approver has decided the direction:
- **WingFoil consumes templates, configurations, methodologies and directives from a remote,
  versioned source**, starting with the approver's public template repository and open to
  third-party sources.
- **No separate "lite" profile.** How much ceremony a project carries is decided by the templates
  and configurations it chooses at `wingfoil init`.

Settled at ratification on 2026-10-01. The options are kept for the record; the choices are under
**Ratified**, after the recommendation.

**Q1 — how a project holds remote content.**
- **(a) Vendored and pinned.** `init` copies the chosen content into `.wingfoil/`, and a lock entry
  records each source's URL and exact commit (or version) in the project's configuration. Every
  later read is local, so runs are reproducible and offline.
- **(b) Referenced.** The project stores only the source and version, and content is fetched when
  needed.

**Q2 — how an initialised project is updated.**
- **(i) Explicit update command.** For example `wingfoil template update`. It fetches a newer pinned
  version, shows a diff, three-way merges against local customisations (the old upstream, the new
  upstream, the local file) and reports conflicts. It writes one audited commit per update, naming
  the source and both versions in a trailer.
- **(ii) Report only.** WingFoil reports that a newer version exists, and the update is applied by
  hand.

**Q3 — the asset classes.** REQ-SEC-07 knows `built-in` and `custom`. Options:
- a third class, `remote`, vendored under its own folder with its own removability and override
  rules;
- remote content treated as `built-in` once vendored, with the pin as its provenance.

**Q4 — trust and safety of a source.**
- Which sources a project accepts: an allowlist declared in the project's configuration.
- What fetched content must pass before it is written: the REQ-SEC-10 schema check, the secret scan
  (`spec-007`), and no executable content.
- Whether a third-party source must be signed or tagged.

**Q5 — release.** The approver chooses. The proposal is v0.4, next to P4.18–P4.20 and the
methodology packs, whose source this decides.

**Recommendation:**

| Question | Choice | Why |
|---|---|---|
| Q1 | (a) | Only a vendored, pinned copy keeps a run deterministic (REQ-SYS-07) and offline |
| Q2 | (i) | An update is a governance change, so it must be explicit, reviewable and one audited commit, like every other WingFoil write |
| Q3 | a third class `remote` | Customisation and removability differ from both `built-in` and `custom` |
| Q4 | allowlist plus REQ-SEC-10 and `spec-007` checks on fetched content | Gates content before it is written |
| Q5 | v0.4 | Next to P4.18–P4.20 and the methodology packs |

**Ratified** on 2026-10-01: every choice is the recommendation. The approve commit `32d58132` records the choices
in its `Reason:`; they are restated here on 2026-10-13.
- **Q1 (a)** vendored and pinned: `init` copies the content into `.wingfoil/`, and a lock entry records each
  source's URL and exact commit.
- **Q2 (i)** an explicit update command: a diff, a three-way merge against local customisations, and one audited
  commit per update.
- **Q3** a third asset class, `remote`.
- **Q4** an allowlist of accepted sources, plus the REQ-SEC-10 schema checks and the `spec-007` secret scan on
  fetched content.
- **Q5** release v0.4, next to P4.18–P4.20 and the methodology packs.

## Rationale

- **Templates evolve at a different pace from the tool.** Shipping them in the package couples a
  methodology fix to a WingFoil release, and leaves companies no way to publish their own.
- **The update path matters more than the first install.** A template applied once and then frozen
  ages, and an unaudited overwrite destroys local customisation. That is why Q1 and Q2 are decided
  together, and why the pin is the determinism anchor.
- **No lite profile:** ceremony is a property of the chosen configuration, not a second product
  mode. Choosing a smaller template is the lite path.

## Actions

1. **Ratify Q1–Q5** at `in-discussion → ready`, and record the template repository's name. Owner:
   approver. **Done:** ratified on 2026-10-01 (`32d58132`); the choices and the name are in this body since
   2026-10-13.
2. **A tech-spec** for the remote source:
   - the lock format and where it lives (`dna.yaml` or a new file);
   - fetch and verify;
   - the update and merge algorithm and its conflict report;
   - the `remote` asset class and its REQ-SEC-07 consequences;
   - offline behaviour;
   - the update commit's trailer.
3. **Fold into v0.4 planning**, together with P4.18–P4.20 and the methodology packs: the packs
   become content of the template repository rather than of the package.
4. **Amend REQ-SEC-07 and REQ-SEC-10** for the new asset class, through their owning tasks.

**Note (2026-10-13, requirements from the template repository; input to Actions 2 and 4).** Agreed with
`wingfoil/wingfoil-templates` (`svc-018`) at the approver's ruling on its questions about bundled packs and the
`remote` class. The Decision above is unchanged. Each item is a requirement the Action 2 tech-spec answers, or an
open question it settles.

1. **No packs bundled in the npm package.** The package ships only WingFoil's own assets, which `init` installs
   under `built-in/` (the P3.8 directives, `spec-011`). Offline use comes from vendoring and the lock (Q1 (a)), not
   from a bundled copy or a fallback, so the first `init` that installs remote content needs the network. For the
   bundle, this supersedes two of the template repository's notes: F-003 (a release step that advances packs
   bundled in the package) and F-005's `--offline` flag reading bundled packs. F-005's other points stand as
   input: a project lock recording the source, each pack's version and parameters, and a digest of every generated
   file, so that an update tells a change made by the pack from a change made by the user (Q2 (i)), and `init` is
   repeatable on another machine.
2. **`init` installs the `base` pack from `wingfoil/wingfoil-templates`** as a `remote` source pinned by the lock
   (URL and commit). Nothing else in WingFoil yet says who installs it or from where.
3. **A pack version resolves to an exact commit.** The template repository's catalog addresses each published
   version by a tag `<catalog pack id>@<version>` and a catalog entry with the commit and one digest per version.
   Fetch-and-verify checks that digest before anything is written, then applies the Q4 checks (the REQ-SEC-10
   schema check and the `spec-007` secret scan). F-004 records why: `dl-031` settled REQ-SEC-10 for assets
   compiled into the package as schema validation only, with no digest or manifest, which is not enough for content
   fetched from a network. The tech-spec states how `dl-031` extends to the `remote` class.
4. **Default-set resolution (open, for the tech-spec).** Which versions `init` installs when no source or version is
   given:
   - **(a)** the latest default set the catalog names;
   - **(b)** each WingFoil release pins a catalog commit naming the default set, and `init` uses it unless a source
     or version is given explicitly.

   **Recommendation (b)**, the approver's on 2026-10-13: the same WingFoil version with the same answers gives the
   same configuration (REQ-SYS-07); under (a) two `init` runs on different days differ. (b) implies a forward-only
   step that advances the pinned catalog commit, published versions only, like `advance-pinned-build` (`dl-095`),
   and a catalog commit the template repository never rewrites. The template repository filed it as **F-027**
   (added below): it accepts (b) and a first `init` that needs the network; it commits to never rewriting the
   catalog commit that resolves a default set (its `main` is protected against force-push), every published
   version resolving to an exact commit through its tag and digest (item 3); how the catalog names the default set
   is fixed with the tech-spec. F-027 records on its side the supersession of item 1 (F-001's bundled copy, F-003's
   step, F-005's bundled `--offline`). Input here and to `dl-164`'s Initialization Template.
5. **The `remote` class (Action 4).** `built-in/` stays WingFoil-only: REQ-SEC-07 decides what is built-in by
   location, and `src/core/builtin-asset.ts` is an allow-list that fails closed on an unknown folder. Remote content
   lands in a `remote/` folder per asset kind; the installer maps a pack's files to it, so a pack uses kind-relative
   paths and never an absolute `.wingfoil/<kind>/<class>/` path. The folder's name and layout and the lock's format
   and location are the tech-spec's (`spec-011` declares the folder). REQ-SEC-07 and REQ-SEC-10 are amended for the
   class through their owning tasks; none exists yet. The template repository accepts the class in **F-029** (added
   below), which replaces F-005's lock request (this decision's lock covers it) and an earlier note (F-007) that had
   packs write `built-in/`. F-029 asks the tech-spec to keep the mapping in the installer, so that a pack is
   installable without knowing its folder, and to state the lock's location and format; the template repository's
   reference composer follows the tech-spec once it fixes the folder, the layout and the lock.
6. **Tell the template repository** when the tech-spec fixes the `remote/` folder, its layout and the lock, so that
   its packs and catalog match them (F-029). This is an action of the tech-spec.

**Added 2026-10-13, after the template repository filed the notes items 4 and 5 name.** F-027 and F-029 are cited
in `reported_by:` at its commit `a15b053a`; for more detail:
- https://github.com/wingfoil/wingfoil-templates/blob/a15b053a7174fd5fa87d472cc394c7f8ad40b0ce/docs/wingfoil-feedback/F-027-a-pinned-default-set-of-packs-at-init.md
- https://github.com/wingfoil/wingfoil-templates/blob/a15b053a7174fd5fa87d472cc394c7f8ad40b0ce/docs/wingfoil-feedback/F-029-packs-land-in-remote-with-the-lock.md

## Relations

- **Related:**
  - `minor-v0.4` (P4.18–P4.20 and the methodology packs);
  - REQ-SEC-07 (immutable built-in assets) and REQ-SEC-10 (schema checks on built-in templates);
  - `spec-011` (the `.wingfoil/` layout, where a `remote` asset folder would be declared);
  - `dl-137` (AGENTS.md: the agent instruction file could itself be generated from, or shipped by,
    a template);
  - `bug-040` (the built-in vs stand-in directives in this repository);
  - `task-135` (secret scan of built-in templates at `init`).
