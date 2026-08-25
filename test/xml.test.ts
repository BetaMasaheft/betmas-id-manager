import { test } from "node:test";
import assert from "node:assert/strict";
import type * as slimdom from "slimdom";
import { parseXml, serializeXml, issuedIdToRecord } from "../src/xml.ts";

test("issuedIdToRecord includes optional attrs only when present (auto id)", () => {
	const doc = parseXml(
		'<issued-id id="LIT0001Foo" type="works" mode="auto" prefix="LIT" sequence="1" suffix="Foo" createdAt="2026-01-01T00:00:00.000Z"/>',
	);
	assert.deepEqual(issuedIdToRecord(doc), {
		id: "LIT0001Foo",
		type: "works",
		mode: "auto",
		createdAt: "2026-01-01T00:00:00.000Z",
		prefix: "LIT",
		sequence: 1,
		suffix: "Foo",
	});
});

test("issuedIdToRecord omits prefix/sequence/suffix for a manual id", () => {
	const doc = parseXml(
		'<issued-id id="BAVet1" type="manuscripts" mode="manual" createdAt="2026-01-01T00:00:00.000Z"/>',
	);
	const record = issuedIdToRecord(doc);
	assert.deepEqual(record, {
		id: "BAVet1",
		type: "manuscripts",
		mode: "manual",
		createdAt: "2026-01-01T00:00:00.000Z",
	});
	assert.equal("prefix" in record, false);
	assert.equal("sequence" in record, false);
});

test("serializeXml round-trips a mutated document", () => {
	const doc = parseXml('<counters><counter type="works">0</counter></counters>');
	(doc.documentElement!.firstElementChild as slimdom.Element).textContent = "5";
	const xml = serializeXml(doc);
	assert.match(xml, /<counter type="works">5<\/counter>/);
	assert.deepEqual(issuedIdToRecord(parseXml('<issued-id id="x" type="works" mode="auto" createdAt="now"/>')).id, "x");
});
