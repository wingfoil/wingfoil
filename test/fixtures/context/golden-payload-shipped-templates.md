# WingFoil Agent Context
<!-- format: 1 | role: developer | element: task:task-001-golden-task | state: 0123456789abcdef0123456789abcdef01234567 -->

## 1. Task

```yaml
format: 1
id: task-001-golden-task
status: draft
title: Golden task
type: task
```

<!-- begin:task:task-001-golden-task -->
<!-- task body. `wingfoil memory add` copies this scaffold, setting only `id`, `title` and
     `status` (and any `--tags` or `--set` value). Fill the required frontmatter fields and replace
     these placeholder comments yourself; `wingfoil memory submit` then checks the required fields,
     moves `status` forward and commits the document as you left it, naming in the commit body the
     content it carries. -->
<!-- end:task:task-001-golden-task -->

## 2. Project DNA

### project

```yaml
name: Golden
```

### modules

```yaml
- name: core
  path: src/core
```

### stacks

```yaml
methodologies:
  - name: TDD
technologies:
  - category: language
    name: TypeScript
```

### team

```yaml
members:
  - name: Golden User
    roles:
      - developer
roles:
  - name: developer
```

### paths

```yaml
sources:
  - src/
```

## 3. Directives (developer + global)

### testing

<!-- begin:directive:testing -->
# Testing

Write the test first.
<!-- end:directive:testing -->

## 4. Relevant Memory (7 documents)

### adr:adr-001-golden-adr

```yaml
format: 1
id: adr-001-golden-adr
status: pending
title: Golden adr
type: adr
```

<!-- begin:adr:adr-001-golden-adr -->
<!-- adr body. `wingfoil memory add` copies this scaffold, setting only `id`, `title` and
     `status` (and any `--tags` or `--set` value). Fill the required frontmatter fields and replace
     these placeholder comments yourself; `wingfoil memory submit` then checks the required fields,
     moves `status` forward and commits the document as you left it, naming in the commit body the
     content it carries. -->

<!-- Replacing an earlier adr? This starter scaffold has no `supersedes:` field, and the starter
     `memory.yaml` no `superseded` state, so approving this adr retires nothing. To use the
     trigger, add `supersedes: ""` to this scaffold (it holds the full id of the replaced element, e.g.
     "adr-2-git-backed-storage", never a short form) and give the type its own `states:` in
     `memory.yaml` whose `sequence` ends in a state listed in `gates`, then an approved state
     listed in `waiting`, then `superseded`: the trigger fires only when `memory approve` lands
     in that `waiting` state, and approve moves only out of a gate. Otherwise retire the replaced element with `wingfoil memory deprecate`, naming
     this one in `--reason`. -->
<!-- end:adr:adr-001-golden-adr -->

### bug:bug-001-golden-bug

```yaml
format: 1
id: bug-001-golden-bug
status: pending
title: Golden bug
type: bug
```

<!-- begin:bug:bug-001-golden-bug -->
<!-- bug body. `wingfoil memory add` copies this scaffold, setting only `id`, `title` and
     `status` (and any `--tags` or `--set` value). Fill the required frontmatter fields and replace
     these placeholder comments yourself; `wingfoil memory submit` then checks the required fields,
     moves `status` forward and commits the document as you left it, naming in the commit body the
     content it carries. -->
<!-- end:bug:bug-001-golden-bug -->

### decision-log:dl-001-golden-decision-log

```yaml
format: 1
id: dl-001-golden-decision-log
status: pending
title: Golden decision-log
type: decision-log
```

<!-- begin:decision-log:dl-001-golden-decision-log -->
<!-- decision-log body. `wingfoil memory add` copies this scaffold, setting only `id`, `title` and
     `status` (and any `--tags` or `--set` value). Fill the required frontmatter fields and replace
     these placeholder comments yourself; `wingfoil memory submit` then checks the required fields,
     moves `status` forward and commits the document as you left it, naming in the commit body the
     content it carries. -->
<!-- end:decision-log:dl-001-golden-decision-log -->

### plan:sw-life-cycle-inception-plan

```yaml
element: ''
format: 1
id: sw-life-cycle-inception-plan
parent: ''
phase: inception
status: active
title: Golden plan
type: plan
workflow: sw-life-cycle
```

<!-- begin:plan:sw-life-cycle-inception-plan -->
<!-- plan body. `wingfoil memory add` copies this scaffold, setting only `id`, `title` and
     `status` (and any `--tags` or `--set` value). Fill the required frontmatter fields and replace
     these placeholder comments yourself; `wingfoil memory submit` then checks the required fields,
     moves `status` forward and commits the document as you left it, naming in the commit body the
     content it carries. -->
<!-- end:plan:sw-life-cycle-inception-plan -->

### release:release-001

```yaml
format: 1
id: release-001
status: pending
title: Golden release
type: release
```

<!-- begin:release:release-001 -->
<!-- release body. `wingfoil memory add` copies this scaffold, setting only `id`, `title` and
     `status` (and any `--tags` or `--set` value). Fill the required frontmatter fields and replace
     these placeholder comments yourself; `wingfoil memory submit` then checks the required fields,
     moves `status` forward and commits the document as you left it, naming in the commit body the
     content it carries. -->
<!-- end:release:release-001 -->

### release-line:rl-001

```yaml
format: 1
id: rl-001
status: pending
title: Golden release-line
type: release-line
```

<!-- begin:release-line:rl-001 -->
<!-- release-line body. `wingfoil memory add` copies this scaffold, setting only `id`, `title` and
     `status` (and any `--tags` or `--set` value). Fill the required frontmatter fields and replace
     these placeholder comments yourself; `wingfoil memory submit` then checks the required fields,
     moves `status` forward and commits the document as you left it, naming in the commit body the
     content it carries. -->
<!-- end:release-line:rl-001 -->

### tech-spec:spec-001-golden-tech-spec

```yaml
format: 1
id: spec-001-golden-tech-spec
status: pending
title: Golden tech-spec
type: tech-spec
```

<!-- begin:tech-spec:spec-001-golden-tech-spec -->
<!-- tech-spec body. `wingfoil memory add` copies this scaffold, setting only `id`, `title` and
     `status` (and any `--tags` or `--set` value). Fill the required frontmatter fields and replace
     these placeholder comments yourself; `wingfoil memory submit` then checks the required fields,
     moves `status` forward and commits the document as you left it, naming in the commit body the
     content it carries. -->

<!-- Replacing an earlier tech-spec? This starter scaffold has no `supersedes:` field, and the starter
     `memory.yaml` no `superseded` state, so approving this tech-spec retires nothing. To use the
     trigger, add `supersedes: ""` to this scaffold (it holds the full id of the replaced element, e.g.
     "spec-2-memory-yaml-schema", never a short form) and give the type its own `states:` in
     `memory.yaml` whose `sequence` ends in a state listed in `gates`, then an approved state
     listed in `waiting`, then `superseded`: the trigger fires only when `memory approve` lands
     in that `waiting` state, and approve moves only out of a gate. Otherwise retire the replaced element with `wingfoil memory deprecate`, naming
     this one in `--reason`. -->
<!-- end:tech-spec:spec-001-golden-tech-spec -->
