/**
 * Central table of known entity types and where this app's state lives.
 * Single source of truth, mirrors the original modules/config.xqm.
 */
import type { TypeInfo, TypeName } from "./types.ts";

export const TYPES: Record<TypeName, TypeInfo> = {
	works: { prefix: "LIT", mode: "auto" },
	studies: { prefix: "STU", mode: "auto" },
	narratives: { prefix: "NAR", mode: "auto" },
	persons: { prefix: "PRS", mode: "auto" },
	places: { prefix: "LOC", mode: "auto" },
	institutions: { prefix: "INS", mode: "auto" },
	manuscripts: { prefix: null, mode: "manual" },
	"authority-files": { prefix: null, mode: "manual" },
};

export function isKnownType(type: string | undefined | null): type is TypeName {
	return typeof type === "string" && Object.hasOwn(TYPES, type);
}

export function typeInfo(type: TypeName): TypeInfo {
	return TYPES[type];
}

export function knownTypes(): TypeName[] {
	return Object.keys(TYPES) as TypeName[];
}

export const DATA_DIR = process.env.DATA_DIR || "./data";
