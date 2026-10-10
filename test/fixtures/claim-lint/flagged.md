---
id: "task-900-fixture"
type: task
status: in-review
---

## Execution Notes

- The helper is unchanged since task-100.
- The old reader does not exist any more: `git grep -n readOld -- src/` printed nothing.
- `grep -rn 'REQ-SYS-09' docs/02_requirements/02_bdd/features/` printed nothing, so there is no BDD coverage.

The parser has no caller outside `src/memory`. Nothing else
needs to change.

| check | result |
|-------|--------|
| coverage | already covered |
