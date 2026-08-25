/**
 * Pure business logic for id reservation/registration/lookup. Deliberately
 * has no HTTP concepts anywhere in this module - app.ts is a thin wrapper
 * on top of it. Mirrors the original modules/ids.xqm.
 *
 * Known accepted gap, carried over from the original: register-manual-id is
 * a plain check-then-store, not a compare-and-swap. In this port it's
 * actually safe in practice - both the check and the store are synchronous,
 * so Node's single-threaded event loop can't interleave a second request in
 * between - but that's an implementation accident, not a guarantee this
 * code makes on purpose.
 */
import { isKnownType, typeInfo, knownTypes } from "./config.ts";
import { BadRequestError, ConflictError } from "./errors.ts";
import type { Store } from "./store.ts";
import type { TypeInfo, TypeName, IssuedIdRecord } from "./types.ts";

const SAFE_ID = /^[\w.-]+$/;

function isSafeId(id: unknown): id is string {
	return typeof id === "string" && id.length > 0 && SAFE_ID.test(id);
}

function requireKnownType(type: string | undefined | null): TypeName {
	if (!isKnownType(type)) {
		throw new BadRequestError(`unknown type: ${type ?? "(missing)"}`);
	}
	return type;
}

// Zero-pad the sequence to 4 digits up to 999, then go unpadded beyond that
// (...0999 then ...1000) - replicates save-new-entity.xql's exact quirk.
function formatSequence(seq: number): string {
	return seq > 999 ? String(seq) : String(seq).padStart(4, "0");
}

function normalizeSuffix(suffix: unknown): string {
	return (typeof suffix === "string" ? suffix : "").replace(/ /g, "_");
}

function now(): string {
	return new Date().toISOString();
}

export interface TypeListing {
	type: TypeName;
	prefix: string | null;
	mode: TypeInfo["mode"];
}

export interface ResetResult {
	type: TypeName;
	mode: TypeInfo["mode"];
	value: number | null;
	purged: number;
}

export interface SeedResult {
	type: TypeName;
	total: number;
	registered: number;
	skipped: number;
	skippedUnsafe: number;
}

export function createIdService(store: Store) {
	function listTypes(): TypeListing[] {
		return knownTypes()
			.slice()
			.sort()
			.map((type) => {
				const info = typeInfo(type);
				return { type, prefix: info.prefix, mode: info.mode };
			});
	}

	function idExists(id: unknown): boolean {
		return isSafeId(id) && store.has(id);
	}

	function getId(id: unknown): IssuedIdRecord | undefined {
		return isSafeId(id) ? store.get(id) : undefined;
	}

	function listIds(type: string | undefined | null): IssuedIdRecord[] {
		if (type !== undefined && type !== null) requireKnownType(type);
		return store
			.list()
			.filter((record) => !type || record.type === type)
			.sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));
	}

	function reserveAutoId(type: string, suffix: unknown): IssuedIdRecord {
		const knownType = requireKnownType(type);
		const info = typeInfo(knownType);
		if (info.mode !== "auto") {
			throw new BadRequestError(`type '${type}' is not auto-numbered; use register-manual-id`);
		}
		const seq = store.nextSequence(knownType);
		const normalizedSuffix = normalizeSuffix(suffix);
		const id = `${info.prefix}${formatSequence(seq)}${normalizedSuffix}`;
		return store.put({
			id,
			type: knownType,
			mode: "auto",
			prefix: info.prefix as string,
			sequence: seq,
			suffix: normalizedSuffix,
			createdAt: now(),
		});
	}

	function registerManualId(type: string, id: unknown): IssuedIdRecord {
		const knownType = requireKnownType(type);
		const info = typeInfo(knownType);
		if (info.mode !== "manual") {
			throw new BadRequestError(`type '${type}' is auto-numbered; use reserve-auto-id`);
		}
		if (!isSafeId(id)) {
			throw new BadRequestError("id is required and must match ^[\\w.-]+$");
		}
		if (idExists(id)) {
			throw new ConflictError(`id already registered: ${id}`);
		}
		return store.put({ id, type: knownType, mode: "manual", createdAt: now() });
	}

	function reserveId(type: string, body: any): IssuedIdRecord {
		const knownType = requireKnownType(type);
		const info = typeInfo(knownType);
		return info.mode === "auto" ? reserveAutoId(knownType, body?.suffix) : registerManualId(knownType, body?.id);
	}

	// Idempotent bulk-register from an external system of record - skips ids
	// already registered, so it's safe to re-run/resume with overlapping
	// batches. Manual-mode types only: auto types have no per-id identity to
	// seed, just a counter (see resetType).
	function seedManualIds(type: string, ids: unknown): SeedResult {
		const knownType = requireKnownType(type);
		const info = typeInfo(knownType);
		if (info.mode !== "manual") {
			throw new BadRequestError(`type '${type}' is auto-numbered; seed it via resetType instead`);
		}
		const all: unknown[] = Array.isArray(ids) ? ids : [];
		const safeIds = all.filter(isSafeId);
		const skippedUnsafe = all.length - safeIds.length;
		const toRegister = safeIds.filter((id) => !idExists(id));
		for (const id of toRegister) {
			store.put({ id, type: knownType, mode: "manual", createdAt: now() });
		}
		return {
			type: knownType,
			total: all.length,
			registered: toRegister.length,
			skipped: safeIds.length - toRegister.length,
			skippedUnsafe,
		};
	}

	function resetType(type: string, value: number | undefined): ResetResult {
		const knownType = requireKnownType(type);
		const info = typeInfo(knownType);
		const toPurge = store.list().filter((record) => record.type === knownType);
		for (const record of toPurge) store.delete(record.id);
		const resetValue = info.mode === "auto" ? store.setCounter(knownType, value ?? 0) : null;
		return { type: knownType, mode: info.mode, value: resetValue, purged: toPurge.length };
	}

	return { listTypes, getId, listIds, reserveId, reserveAutoId, registerManualId, seedManualIds, resetType };
}

export type IdService = ReturnType<typeof createIdService>;
