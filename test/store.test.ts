import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Store } from "../src/store.ts";

function tempDir(): string {
	return fs.mkdtempSync(path.join(os.tmpdir(), "bim-store-"));
}

test("a fresh store starts every auto counter at 0", () => {
	const store = new Store(tempDir());
	assert.equal(store.getCounter("works"), 0);
	assert.equal(store.getCounter("persons"), 0);
});

test("nextSequence increments and persists", () => {
	const store = new Store(tempDir());
	assert.equal(store.nextSequence("works"), 1);
	assert.equal(store.nextSequence("works"), 2);
	assert.equal(store.getCounter("works"), 2);
});

test("put/get/has/list/delete round-trip a record", () => {
	const store = new Store(tempDir());
	const record = store.put({
		id: "BAVet1",
		type: "manuscripts",
		mode: "manual",
		createdAt: "2026-01-01T00:00:00.000Z",
	});
	assert.equal(record.id, "BAVet1");
	assert.equal(store.has("BAVet1"), true);
	assert.deepEqual(store.get("BAVet1"), record);
	assert.deepEqual(store.list(), [record]);

	store.delete("BAVet1");
	assert.equal(store.has("BAVet1"), false);
	assert.deepEqual(store.list(), []);
});

test("state survives reopening the store against the same directory", () => {
	const dir = tempDir();
	const store1 = new Store(dir);
	store1.put({ id: "BAVet1", type: "manuscripts", mode: "manual", createdAt: "2026-01-01T00:00:00.000Z" });
	store1.nextSequence("works");
	store1.nextSequence("works");

	const store2 = new Store(dir);
	assert.equal(store2.has("BAVet1"), true);
	assert.equal(store2.getCounter("works"), 2);
});

test("rejects an id that would escape the ids directory", () => {
	const store = new Store(tempDir());
	assert.throws(() =>
		store.put({
			id: "../escaped",
			type: "works",
			mode: "auto",
			prefix: "LIT",
			sequence: 1,
			suffix: "",
			createdAt: "now",
		}),
	);
});
