---
id: "task-901-fixture"
type: task
status: in-review
---

## Execution Notes

- The helper is unchanged since task-100 (`git diff --stat abc1234 -- src/helper.ts`).
- `git grep -c 'REQ-' -- docs/02_requirements/02_bdd/features/` printed nothing, while
  `git grep -c 'Scenario' -- docs/02_requirements/02_bdd/features/` lists 63 files: the pattern could match.
- `grep -rn readOld src/` printed nothing; its positive case is the same grep on `HEAD~1`, which finds it.
- Implemented the reader and its tests.

```sh
grep -rn unchanged src/   # a claim word inside a code block is not prose
```

<!-- a comment saying the code does not exist is not prose either -->
