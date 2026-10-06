# A drifted copy of the exit-code enumerations (task-187 fixture)

One document stands in for spec-008 §5, spec-005 §1 and spec-009 §3: its tables drop `2` and invent
`3`; its bullets put `E_INVALID_TRANSITION` on `2`, drop `E_YAML_PARSE_ERROR` and invent `E_TELEPORT`.

### 1. Exit-code contract

| Code | Name    | When |
|------|---------|------|
| `0`  | Success | done |
| `1`  | Logic   | failed |
| `3`  | Teleport | elsewhere |

### 3. Shared error-code convention

- **`2`** — integrity failures, e.g. `E_INVALID_TRANSITION`; a family `E_INVALID_*` is skipped.
- **`1`** — every other failure: `E_VALIDATION`, and
  `E_TELEPORT`.

### 5. Exit-code contract

| Code | Name    | When |
|------|---------|------|
| `0`  | Success | done |
| `1`  | Logic   | failed |
| `3`  | Teleport | elsewhere |

### 6. Next
