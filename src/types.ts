export type TypeName =
	"works" | "studies" | "narratives" | "persons" | "places" | "institutions" | "manuscripts" | "authority-files";

export type Mode = "auto" | "manual";

export interface TypeInfo {
	prefix: string | null;
	mode: Mode;
}

interface IssuedIdBase {
	id: string;
	type: TypeName;
	createdAt: string;
}

export interface AutoIssuedId extends IssuedIdBase {
	mode: "auto";
	prefix: string;
	sequence: number;
	suffix: string;
}

export interface ManualIssuedId extends IssuedIdBase {
	mode: "manual";
}

export type IssuedIdRecord = AutoIssuedId | ManualIssuedId;
