# A drifted copy of the MCP-surface enumerations (task-187 fixture)

The server side the test pairs with this file: Resources `wingfoil://dna` and `wingfoil://workflows`,
Tools `memory.add`, derived Tools `memory.add` and `memory.submit`. This copy drops the workflows
Resource, invents a teleport Resource and a teleport Tool, and omits `memory.submit`.

#### 2.1 URI scheme

```
wingfoil://dna
wingfoil://teleport                           # invented
```

#### 2.2 Read contract

#### 4.1 Naming convention

```
CLI command                    → MCP Tool name
wingfoil memory add             → memory.add
wingfoil memory teleport        → memory.teleport
```

#### 4.2 Parity requirement
