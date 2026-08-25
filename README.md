# betmas-id-manager

Standalone id-management service for BetaMasaheft. Hands out and tracks entity
ids for manuscripts, works, persons, places, narratives, studies, institutions
and authority-files, as a small Node.js service backed by its own Docker
volume - so the rest of the BetMas/betmasweb stack can stay stateless and be
redeployed freely.

Replaces the id-generation logic that currently lives inline in
`edit/save-new-entity.xql` (in both `betmasweb` and `BetMas`), which scans the
live collection for the current max numeric id and increments it - a
scan-and-increment with a real race condition between the scan and the
eventual store. This service centralizes that bookkeeping behind a small
REST API with its own durable, atomically-updated counter state.

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

| Method | Path                  | Description                                                  |
| ------ | --------------------- | ------------------------------------------------------------ |
| GET    | `/types`              | List known types with their prefix/mode                      |
| POST   | `/ids/{type}`         | Reserve an id (auto) or register one (manual)                |
| GET    | `/id/{id}`            | Look up a previously issued id                               |
| GET    | `/ids?type=`          | List issued ids, optionally filtered by type                 |
| POST   | `/types/{type}/reset` | Test/dev utility: reset a counter and purge its issued ids   |
| POST   | `/types/{type}/seed`  | Bulk-register ids from an external system of record (manual) |

See `api.json` for the full OpenAPI spec, also served live at `GET /api.json`.

## Implementation

Plain Node.js (`node:http`, no framework) with all business logic in
`src/ids.ts`, kept free of HTTP concepts so it stays directly testable and
callable. State is persisted as XML - a `counters.xml` document and one
`<issued-id>` file per issued id, mirroring the original eXist collection
layout - read and written with [slimdom](https://github.com/bwrrp/slimdom.js)
(the DOM) and [fontoxpath](https://github.com/FontoXML/fontoxpath) (XPath 3.1
queries over it, including its map/array support for building response
records directly). All records are also kept in memory: this is a small id
registry, not a document corpus, so a full in-memory index keeps request
handling to plain map lookups, with disk only touched on mutations and at
startup.

The atomic-counter guarantee that motivated this service doesn't need a lock
in Node: `src/store.ts`'s counter increment is a synchronous read-modify-write
with no `await` in the middle, and Node's single-threaded event loop can't
interleave another request's handler into the middle of a synchronous
function. `npm run test:concurrency` fires genuinely concurrent requests at a
running server to prove this holds.

### TypeScript, with no build step

Everything is `.ts`, run directly by Node 24's native TypeScript support -
`node src/server.ts` strips types at load time, no `tsc`/bundler/`dist/`
anywhere in the run path, in dev or in the Docker image. Only erasable
syntax is used (no `enum`, no experimental decorators, no parameter
properties) so nothing needs `--experimental-transform-types`.
`npm run typecheck` runs `tsc --noEmit` purely for static checking - it's a
CI gate, not a build step, and `typescript`/`@types/node` are dev-only,
never installed in the production image.

## Local development

```sh
docker compose up --build
```

Brings up the service on `localhost:8080` with a named volume
(`betmas-id-manager-data`) for `/data`.

Faster inner loop without Docker:

```sh
npm install
npm run dev   # node --watch src/server.ts, state under ./data
```

## Testing

```sh
npm test                 # unit + in-process integration tests (node:test)
npm run typecheck        # tsc --noEmit, static checking only
npm run test:concurrency # concurrency stress test against a running server
npm run validate:openapi # validate api.json against the OpenAPI 3.0 schema
```
