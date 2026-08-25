# betmas-id-manager

Standalone id-management service for BetaMasaheft. Hands out and tracks entity
ids for manuscripts, works, persons, places, narratives, studies, institutions
and authority-files, in its own eXist-db instance backed by its own Docker
volume - so the rest of the BetMas/betmasweb stack can stay stateless and be
redeployed freely.

Replaces the id-generation logic that currently lives inline in
`edit/save-new-entity.xql` (in both `betmasweb` and `BetMas`), which scans the
live collection for the current max numeric id and increments it - a
scan-and-increment with a real race condition between the scan and the
eventual `xmldb:store()`. This service centralizes that bookkeeping behind a
small REST API with its own durable, atomically-updated counter state.

**This service is not wired into `save-new-entity.xql` yet** - see the
project's implementation plan for what's in and out of scope for the current
pass.

## Entity types

| Collection      | Prefix | Mode   | Format                               |
| --------------- | ------ | ------ | ------------------------------------ |
| works           | LIT    | auto   | `LIT` + 4-digit sequence + suffix    |
| studies         | STU    | auto   | same                                 |
| narratives      | NAR    | auto   | same                                 |
| persons         | PRS    | auto   | same                                 |
| places          | LOC    | auto   | same                                 |
| institutions    | INS    | auto   | same                                 |
| manuscripts     | —      | manual | caller supplies the full id verbatim |
| authority-files | —      | manual | caller supplies the full id verbatim |

Auto-numbered ids zero-pad the sequence to 4 digits up to 999, then go
unpadded beyond that (`...0999` then `...1000`) - this replicates
`save-new-entity.xql`'s existing behavior exactly, including its quirks.

## API

| Method | Path                  | Description                                                                 |
| ------ | --------------------- | --------------------------------------------------------------------------- |
| GET    | `/types`              | List known types with their prefix/mode                                     |
| POST   | `/ids/{type}`         | Reserve an id (auto) or register one (manual)                               |
| GET    | `/id/{id}`            | Look up a previously issued id (singular path - see api.xql comment on why) |
| GET    | `/ids?type=`          | List issued ids, optionally filtered by type                                |
| POST   | `/types/{type}/reset` | Test/dev utility: reset a counter and purge its issued ids                  |
| POST   | `/types/{type}/seed`  | Bulk-register ids from an external system of record (manual types only)     |

See `api.json` for the full OpenAPI spec.

## Local development

```sh
docker compose up --build
```

Brings up eXist on `localhost:8080` with this app auto-deployed and a named
volume (`betmas-id-manager-data`) for `/exist/data`.

Faster inner loop against an already-running local eXist instance:

```sh
npm run deploy:dev
```

## Testing

```sh
npm test                 # Cypress e2e against a running instance (see cypress.config.cjs)
npm run test:concurrency # concurrency stress test for the atomic counter
bats tests/connect_spec.bats  # container smoke tests
```

Run `bats` first, right after a fresh boot, before `npm test`: several Cypress
specs deliberately exercise 400/404/409 error paths, and roaster logs those at
ERROR level by design, which would otherwise fail bats's "logs are error free"
check even though nothing is actually wrong.
