# A drifted copy of the Memory-type enumerations (task-187 fixture)

The code side the test pairs with this file: `defaults` as below; `task` with sequence
draft > backlog > in-progress > done, gate backlog → draft, waiting in-progress, returns
in-progress → backlog; `bug` with sequence draft > open > closed. This copy drops `bug`, invents `adr`,
drops `in-progress` from task's sequence, waits on the wrong state and omits the returns edge.

### Worked examples — every current type in the new format

```yaml
defaults:
  states:
    sequence: [ draft, pending, approved ]
    gates:
      pending: { reject: draft }
types:
  task:
    states:
      sequence: [ draft, backlog, done ]
      gates:
        backlog: { reject: draft }
      waiting: [ done ]
  adr:
    states:
      sequence: [ draft, accepted ]
```

## Consequences

#### 2.1 URI scheme

- `{type}` is any type key declared in `memory.yaml` `types:` (`task, rfc`).

#### 2.2 Read contract
