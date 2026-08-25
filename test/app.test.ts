import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Store } from "../src/store.ts";
import { createApp } from "../src/app.ts";

async function withServer(run: (baseUrl: string) => Promise<void>): Promise<void> {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bim-app-"));
	const server = http.createServer(createApp(new Store(dir)));
	await new Promise<void>((resolve) => server.listen(0, resolve));
	const address = server.address();
	const port = typeof address === "object" && address ? address.port : 0;
	const baseUrl = `http://127.0.0.1:${port}`;
	try {
		await run(baseUrl);
	} finally {
		await new Promise((resolve) => server.close(resolve));
	}
}

function req(baseUrl: string, method: string, urlPath: string, body?: unknown): Promise<Response> {
	return fetch(`${baseUrl}${urlPath}`, {
		method,
		headers: body === undefined ? undefined : { "Content-Type": "application/json" },
		body: body === undefined ? undefined : JSON.stringify(body),
	});
}

test("GET /types returns 200 with all known types", async () => {
	await withServer(async (baseUrl) => {
		const res = await req(baseUrl, "GET", "/types");
		assert.equal(res.status, 200);
		const types = await res.json();
		assert.equal(types.length, 8);
	});
});

test("POST /ids/{unknownType} returns 400", async () => {
	await withServer(async (baseUrl) => {
		const res = await req(baseUrl, "POST", "/ids/not-a-real-type", {});
		assert.equal(res.status, 400);
		assert.ok((await res.json()).error);
	});
});

test("POST /ids/{type} reserves an auto id and GET /id/{id} finds it", async () => {
	await withServer(async (baseUrl) => {
		const created = await req(baseUrl, "POST", "/ids/works", { suffix: "Known" });
		assert.equal(created.status, 201);
		const body = await created.json();
		assert.equal(body.id, "LIT0001Known");

		const lookup = await req(baseUrl, "GET", `/id/${body.id}`);
		assert.equal(lookup.status, 200);
		assert.equal((await lookup.json()).id, body.id);
	});
});

test("GET /id/{id} returns 404 for an unknown id", async () => {
	await withServer(async (baseUrl) => {
		const res = await req(baseUrl, "GET", "/id/DOES_NOT_EXIST");
		assert.equal(res.status, 404);
	});
});

test("POST /ids/manuscripts registers a manual id, conflicts on repeat", async () => {
	await withServer(async (baseUrl) => {
		const first = await req(baseUrl, "POST", "/ids/manuscripts", { id: "BAVet1" });
		assert.equal(first.status, 201);

		const second = await req(baseUrl, "POST", "/ids/manuscripts", { id: "BAVet1" });
		assert.equal(second.status, 409);
		assert.ok((await second.json()).error);
	});
});

test("GET /ids?type= filters, and rejects an unknown type", async () => {
	await withServer(async (baseUrl) => {
		await req(baseUrl, "POST", "/ids/works", { suffix: "a" });
		await req(baseUrl, "POST", "/ids/persons", { suffix: "b" });

		const all = await req(baseUrl, "GET", "/ids");
		assert.equal((await all.json()).length, 2);

		const filtered = await req(baseUrl, "GET", "/ids?type=works");
		const filteredBody = await filtered.json();
		assert.equal(filteredBody.length, 1);
		assert.equal(filteredBody[0].type, "works");

		const bad = await req(baseUrl, "GET", "/ids?type=bogus");
		assert.equal(bad.status, 400);
	});
});

test("POST /types/{type}/reset resets the counter and purges issued ids", async () => {
	await withServer(async (baseUrl) => {
		await req(baseUrl, "POST", "/ids/narratives", { suffix: "a" });
		const res = await req(baseUrl, "POST", "/types/narratives/reset", { value: 41 });
		assert.equal(res.status, 200);
		assert.deepEqual(await res.json(), { type: "narratives", mode: "auto", value: 41, purged: 1 });

		const next = await req(baseUrl, "POST", "/ids/narratives", { suffix: "z" });
		assert.equal((await next.json()).id, "NAR0042z");
	});
});

test("POST /types/{type}/seed bulk-registers manual ids idempotently", async () => {
	await withServer(async (baseUrl) => {
		const first = await req(baseUrl, "POST", "/types/manuscripts/seed", { ids: ["Seed1", "Seed2"] });
		assert.equal(first.status, 200);
		assert.deepEqual(await first.json(), {
			type: "manuscripts",
			total: 2,
			registered: 2,
			skipped: 0,
			skippedUnsafe: 0,
		});

		const second = await req(baseUrl, "POST", "/types/manuscripts/seed", { ids: ["Seed1", "Seed2"] });
		assert.deepEqual(await second.json(), {
			type: "manuscripts",
			total: 2,
			registered: 0,
			skipped: 2,
			skippedUnsafe: 0,
		});
	});
});

test("POST /types/{type}/seed rejects an auto-numbered type", async () => {
	await withServer(async (baseUrl) => {
		const res = await req(baseUrl, "POST", "/types/works/seed", { ids: ["LIT0001"] });
		assert.equal(res.status, 400);
	});
});

test("GET /api.json serves the OpenAPI spec", async () => {
	await withServer(async (baseUrl) => {
		const res = await req(baseUrl, "GET", "/api.json");
		assert.equal(res.status, 200);
		const spec = await res.json();
		assert.equal(spec.info.title, "betmas-id-manager");
	});
});

test("unknown routes return 404, and every response carries CORS headers", async () => {
	await withServer(async (baseUrl) => {
		const res = await req(baseUrl, "GET", "/nope");
		assert.equal(res.status, 404);
		assert.equal(res.headers.get("access-control-allow-origin"), "*");
	});
});

test("OPTIONS preflight returns 204 with CORS headers", async () => {
	await withServer(async (baseUrl) => {
		const res = await req(baseUrl, "OPTIONS", "/ids/works");
		assert.equal(res.status, 204);
		assert.equal(res.headers.get("access-control-allow-methods"), "GET, POST, DELETE, PUT, PATCH, OPTIONS");
	});
});

test("an invalid JSON body returns 400", async () => {
	await withServer(async (baseUrl) => {
		const res = await fetch(`${baseUrl}/ids/manuscripts`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: "{not json",
		});
		assert.equal(res.status, 400);
	});
});
