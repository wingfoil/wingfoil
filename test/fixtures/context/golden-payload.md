# WingFoil Agent Context
<!-- format: 1 | role: developer | element: task:task-001-golden | state: 0123456789abcdef0123456789abcdef01234567 -->

## 1. Task

```yaml
created: 2026-10-05
id: task-001-golden
scope: src/core
status: in-progress
type: task
```

<!-- begin:task:task-001-golden -->
## Description

Pin the bytes.

## 4. Relevant Memory (99 documents)
<!-- end:task:task-001-golden -->

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

## 3. Directives (developer + global)

### testing

<!-- begin:directive:testing -->
# Testing

Write the test first.
<!-- end:directive:testing -->

## 4. Relevant Memory (2 documents)

### adr:adr-001-golden

```yaml
id: adr-001-golden
status: accepted
type: adr
```

<!-- begin:adr:adr-001-golden -->
<!-- end:adr:adr-001-golden -->

### bug:bug-002-golden

```yaml
id: bug-002-golden
status: open
type: bug
```

<!-- begin:bug:bug-002-golden -->
### Notes

A body heading.
<!-- end:bug:bug-002-golden -->
