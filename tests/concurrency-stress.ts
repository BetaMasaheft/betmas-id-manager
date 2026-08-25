#!/usr/bin/env node
/**
 * Concurrency stress test for the atomic counter idiom in src/store.ts.
 *
 * This proves that N truly concurrent POST /ids/{type} requests produce
 * exactly the sequence numbers {1..N}, no duplicates, no gaps - not just
 * that the code reads correctly. Runs against a real running server (not
 * in-process) so requests are genuinely concurrent at the network/event-loop
 * level, not just sequential awaits.
 */
const BASE_URL = process.env.BASE_URL || "http://localhost:8080";
const TYPE = process.env.CONCURRENCY_TYPE || "works";
const N = Number(process.env.CONCURRENCY_N || 50);

async function main(): Promise<void> {
	console.log(`resetting counter for type=${TYPE} at ${BASE_URL} ...`);
	const resetRes = await fetch(`${BASE_URL}/types/${TYPE}/reset`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({}),
	});
	if (!resetRes.ok) {
		throw new Error(`reset failed: ${resetRes.status} ${await resetRes.text()}`);
	}

	console.log(`firing ${N} concurrent POST /ids/${TYPE} requests ...`);
	// Dispatch every request before awaiting any of them, so they're
	// genuinely in flight together rather than serialized by await.
	const requests = Array.from({ length: N }, (_, i) =>
		fetch(`${BASE_URL}/ids/${TYPE}`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ suffix: `stress${i}` }),
		}),
	);

	const responses = await Promise.all(requests);
	const bodies: { sequence: number }[] = await Promise.all(responses.map((r) => r.json()));

	const failures = responses.filter((r) => r.status !== 201);
	if (failures.length > 0) {
		console.error(`FAIL: ${failures.length}/${N} requests did not return 201`);
		process.exit(1);
	}

	const sequences = bodies.map((b) => b.sequence).sort((a, b) => a - b);
	const expected = Array.from({ length: N }, (_, i) => i + 1);

	const duplicates = sequences.filter((v, i) => sequences[i - 1] === v);
	const matchesExpected = JSON.stringify(sequences) === JSON.stringify(expected);

	if (duplicates.length > 0) {
		console.error(`FAIL: duplicate sequence numbers issued: ${[...new Set(duplicates)].join(", ")}`);
		process.exit(1);
	}
	if (!matchesExpected) {
		const missing = expected.filter((v) => !sequences.includes(v));
		console.error(`FAIL: sequences don't form a clean 1..${N} run.`);
		console.error(`  got:      ${sequences.join(",")}`);
		console.error(`  missing:  ${missing.join(",")}`);
		process.exit(1);
	}

	console.log(`OK: ${N} concurrent reservations produced exactly {1..${N}}, no duplicates, no gaps.`);
}

main().catch((err) => {
	console.error("FAIL:", err.message);
	process.exit(1);
});
