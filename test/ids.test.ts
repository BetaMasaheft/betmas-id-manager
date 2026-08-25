import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Store } from "../src/store.ts";
import { createIdService } from "../src/ids.ts";
import { BadRequestError, ConflictError } from "../src/errors.ts";

function service() {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bim-ids-"));
	return createIdService(new Store(dir));
}

test("listTypes lists all 8 known types with correct prefix/mode", () => {
	const ids = service();
	const types = ids.listTypes();
	assert.equal(types.length, 8);

	const byType = Object.fromEntries(types.map((t) => [t.type, t]));
	assert.deepEqual(byType.works, { type: "works", prefix: "LIT", mode: "auto" });
	assert.deepEqual(byType.studies, { type: "studies", prefix: "STU", mode: "auto" });
	assert.deepEqual(byType.narratives, { type: "narratives", prefix: "NAR", mode: "auto" });
	assert.deepEqual(byType.persons, { type: "persons", prefix: "PRS", mode: "auto" });
	assert.deepEqual(byType.places, { type: "places", prefix: "LOC", mode: "auto" });
	assert.deepEqual(byType.institutions, { type: "institutions", prefix: "INS", mode: "auto" });
	assert.equal(byType.manuscripts.mode, "manual");
	assert.equal(byType["authority-files"].mode, "manual");
});

test("reserveAutoId reserves PREFIX0001<suffix> for every auto type", () => {
	for (const [type, prefix] of Object.entries({
		works: "LIT",
		studies: "STU",
		narratives: "NAR",
		persons: "PRS",
		places: "LOC",
		institutions: "INS",
	})) {
		const ids = service();
		const record = ids.reserveAutoId(type, "Foo");
		assert.equal(record.id, `${prefix}0001Foo`);
		assert.equal(record.mode, "auto");
		assert.equal(record.mode === "auto" && record.sequence, 1);
	}
});

test("sequential reserves increment cleanly with no collisions", () => {
	const ids = service();
	assert.equal(ids.reserveAutoId("works", "a").id, "LIT0001a");
	assert.equal(ids.reserveAutoId("works", "b").id, "LIT0002b");
	assert.equal(ids.reserveAutoId("works", "c").id, "LIT0003c");
});

test("replaces spaces in the suffix with underscores", () => {
	const ids = service();
	assert.equal(ids.reserveAutoId("persons", "John Doe").id, "PRS0001John_Doe");
});

test("pads to 4 digits up to 999, then goes unpadded beyond", () => {
	const ids = service();
	ids.resetType("places", 998);
	assert.equal(ids.reserveAutoId("places", "x").id, "LOC0999x");
	assert.equal(ids.reserveAutoId("places", "y").id, "LOC1000y");
});

test("reserveId on an auto type ignores a manual-shaped body's `id`, suffix defaults empty", () => {
	const ids = service();
	const record = ids.reserveId("works", { id: "ignored" });
	assert.equal(record.id, "LIT0001");
});

test("reserveAutoId on a manual type is rejected", () => {
	const ids = service();
	assert.throws(() => ids.reserveAutoId("manuscripts", "x"), BadRequestError);
});

test("registerManualId registers verbatim, no prefix", () => {
	const ids = service();
	const record = ids.registerManualId("manuscripts", "BAVet1");
	assert.deepEqual(
		{ id: record.id, type: record.type, mode: record.mode },
		{ id: "BAVet1", type: "manuscripts", mode: "manual" },
	);
});

test("registerManualId rejects re-registering an already-taken id with a conflict", () => {
	const ids = service();
	ids.registerManualId("manuscripts", "BAVet1");
	assert.throws(() => ids.registerManualId("manuscripts", "BAVet1"), ConflictError);
});

test("registerManualId rejects unsafe characters", () => {
	const ids = service();
	assert.throws(() => ids.registerManualId("manuscripts", "../etc/passwd"), BadRequestError);
});

test("registerManualId rejects a missing id", () => {
	const ids = service();
	assert.throws(() => ids.registerManualId("manuscripts", undefined), BadRequestError);
});

test("registerManualId on an auto type is rejected", () => {
	const ids = service();
	assert.throws(() => ids.registerManualId("works", "x"), BadRequestError);
});

test("reserveId/registerManualId/listTypes/listIds/resetType/seedManualIds reject unknown types", () => {
	const ids = service();
	assert.throws(() => ids.reserveId("not-a-real-type", {}), BadRequestError);
	assert.throws(() => ids.resetType("not-a-real-type", undefined), BadRequestError);
	assert.throws(() => ids.listIds("bogus"), BadRequestError);
	assert.throws(() => ids.seedManualIds("not-a-type", ["x"]), BadRequestError);
});

test("getId returns the full record for a known id, undefined otherwise", () => {
	const ids = service();
	const created = ids.reserveAutoId("works", "Known");
	assert.deepEqual(ids.getId(created.id), created);
	assert.equal(ids.getId("DOES_NOT_EXIST"), undefined);
});

test("listIds lists unfiltered and filters by type", () => {
	const ids = service();
	ids.reserveAutoId("works", "a");
	ids.reserveAutoId("persons", "b");

	assert.equal(ids.listIds(undefined).length, 2);
	const worksOnly = ids.listIds("works");
	assert.equal(worksOnly.length, 1);
	assert.equal(worksOnly[0].type, "works");
});

test("resetType reflects the new counter value on the next reserve", () => {
	const ids = service();
	const res = ids.resetType("narratives", 41);
	assert.deepEqual(res, { type: "narratives", mode: "auto", value: 41, purged: 0 });
	assert.equal(ids.reserveAutoId("narratives", "z").id, "NAR0042z");
});

test("resetType with no value defaults the counter to 0", () => {
	const ids = service();
	const res = ids.resetType("studies", undefined);
	assert.equal(res.value, 0);
});

test("resetType purges previously issued ids for that type", () => {
	const ids = service();
	const created = ids.reserveAutoId("institutions", "purgeme");
	const res = ids.resetType("institutions", undefined);
	assert.equal(res.purged, 1);
	assert.equal(ids.getId(created.id), undefined);
});

test("resetType on a manual type ignores value, reports value null, still purges", () => {
	const ids = service();
	ids.registerManualId("manuscripts", "TmpMs1");
	const res = ids.resetType("manuscripts", undefined);
	assert.deepEqual(res, { type: "manuscripts", mode: "manual", value: null, purged: 1 });
	assert.equal(ids.getId("TmpMs1"), undefined);
});

test("seedManualIds bulk-registers and is idempotent", () => {
	const ids = service();
	const first = ids.seedManualIds("manuscripts", ["Seed1", "Seed2", "Seed3"]);
	assert.deepEqual(first, { type: "manuscripts", total: 3, registered: 3, skipped: 0, skippedUnsafe: 0 });

	const second = ids.seedManualIds("manuscripts", ["Seed1", "Seed2", "Seed3"]);
	assert.deepEqual(second, { type: "manuscripts", total: 3, registered: 0, skipped: 3, skippedUnsafe: 0 });
});

test("seedManualIds mixes new and already-registered ids in one batch", () => {
	const ids = service();
	ids.seedManualIds("manuscripts", ["Seed1"]);
	const res = ids.seedManualIds("manuscripts", ["Seed1", "Seed4"]);
	assert.deepEqual(res, { type: "manuscripts", total: 2, registered: 1, skipped: 1, skippedUnsafe: 0 });
	assert.ok(ids.getId("Seed4"));
});

test("seedManualIds skips unsafe ids without registering them", () => {
	const ids = service();
	const res = ids.seedManualIds("manuscripts", ["Seed5", "not a safe id!"]);
	assert.deepEqual(res, { type: "manuscripts", total: 2, registered: 1, skipped: 0, skippedUnsafe: 1 });
	assert.equal(ids.getId("not a safe id!"), undefined);
});

test("seedManualIds rejects an auto-numbered type", () => {
	const ids = service();
	assert.throws(() => ids.seedManualIds("works", ["LIT0001"]), BadRequestError);
});

test("many sequential reserves across microtask ticks still produce a clean 1..N run", async () => {
	const ids = service();
	const N = 200;
	const results = await Promise.all(
		Array.from({ length: N }, (_, i) => Promise.resolve().then(() => ids.reserveAutoId("works", `s${i}`))),
	);
	const sequences = results.map((r) => (r.mode === "auto" ? r.sequence : -1)).sort((a, b) => a - b);
	assert.deepEqual(
		sequences,
		Array.from({ length: N }, (_, i) => i + 1),
	);
});
