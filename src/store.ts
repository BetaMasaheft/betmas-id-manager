import fs from "node:fs";
import path from "node:path";
import type * as slimdom from "slimdom";
import { TYPES } from "./config.ts";
import { parseXml, serializeXml, evaluateXPathToFirstNode, issuedIdToRecord } from "./xml.ts";
import type { TypeName, IssuedIdRecord } from "./types.ts";

const AUTO_TYPES = (Object.keys(TYPES) as TypeName[]).filter((type) => TYPES[type].mode === "auto");

/**
 * Durable state for the id registry: a counters.xml document (one <counter>
 * per auto-numbered type) plus one <issued-id>.xml file per issued id -
 * mirrors the original eXist layout (counters.xml + an ids/ collection) so
 * the on-disk shape stays legible, just on a plain filesystem instead of a
 * database.
 *
 * All issued-id records are also kept in an in-memory Map, loaded once at
 * startup: this is a small id registry, not a document corpus, so holding
 * it all in memory is the simplest correct option and makes lookups plain
 * map reads instead of per-request disk access. Every mutation (put,
 * delete, setCounter) is synchronous and writes straight through to disk
 * before returning - combined with Node's single-threaded event loop, that
 * means a read-modify-write like nextSequence() can never be interleaved by
 * another request's handler, so it's atomic without needing a lock.
 */
export class Store {
	readonly dataDir: string;
	readonly idsDir: string;
	readonly countersPath: string;
	private records = new Map<string, IssuedIdRecord>();
	private countersDoc!: slimdom.Document;

	constructor(dataDir: string) {
		this.dataDir = dataDir;
		this.idsDir = path.join(dataDir, "ids");
		this.countersPath = path.join(dataDir, "counters.xml");
		this.load();
	}

	private load(): void {
		fs.mkdirSync(this.idsDir, { recursive: true });

		this.countersDoc = fs.existsSync(this.countersPath)
			? parseXml(fs.readFileSync(this.countersPath, "utf8"))
			: parseXml(`<counters>${AUTO_TYPES.map((type) => `<counter type="${type}">0</counter>`).join("")}</counters>`);
		this.persistCounters();

		for (const file of fs.readdirSync(this.idsDir)) {
			if (!file.endsWith(".xml")) continue;
			const doc = parseXml(fs.readFileSync(path.join(this.idsDir, file), "utf8"));
			const record = issuedIdToRecord(doc);
			this.records.set(record.id, record);
		}
	}

	private persistCounters(): void {
		fs.writeFileSync(this.countersPath, serializeXml(this.countersDoc));
	}

	private counterNode(type: TypeName): slimdom.Element | null {
		return evaluateXPathToFirstNode<slimdom.Element>("/counters/counter[@type = $type]", this.countersDoc, null, {
			type,
		});
	}

	/** Guards against an id (e.g. an auto-type suffix) escaping the ids directory on disk. */
	private pathFor(id: string): string {
		const idsDir = path.resolve(this.idsDir);
		const resolved = path.resolve(idsDir, `${id}.xml`);
		if (path.dirname(resolved) !== idsDir) {
			throw new Error(`refusing to write outside the ids directory for id: ${id}`);
		}
		return resolved;
	}

	getCounter(type: TypeName): number {
		const node = this.counterNode(type);
		return node ? Number(node.textContent) : 0;
	}

	setCounter(type: TypeName, value: number): number {
		let node = this.counterNode(type);
		if (!node) {
			node = this.countersDoc.createElement("counter");
			node.setAttribute("type", type);
			this.countersDoc.documentElement!.appendChild(node);
		}
		node.textContent = String(value);
		this.persistCounters();
		return value;
	}

	nextSequence(type: TypeName): number {
		return this.setCounter(type, this.getCounter(type) + 1);
	}

	has(id: string): boolean {
		return this.records.has(id);
	}

	get(id: string): IssuedIdRecord | undefined {
		return this.records.get(id);
	}

	list(): IssuedIdRecord[] {
		return [...this.records.values()];
	}

	put(record: IssuedIdRecord): IssuedIdRecord {
		const doc = parseXml("<issued-id/>");
		const el = doc.documentElement!;
		el.setAttribute("id", record.id);
		el.setAttribute("type", record.type);
		el.setAttribute("mode", record.mode);
		el.setAttribute("createdAt", record.createdAt);
		if (record.mode === "auto") {
			el.setAttribute("prefix", record.prefix);
			el.setAttribute("sequence", String(record.sequence));
			el.setAttribute("suffix", record.suffix);
		}

		fs.writeFileSync(this.pathFor(record.id), serializeXml(doc));
		const stored = issuedIdToRecord(doc);
		this.records.set(stored.id, stored);
		return stored;
	}

	delete(id: string): void {
		this.records.delete(id);
		const file = this.pathFor(id);
		if (fs.existsSync(file)) fs.unlinkSync(file);
	}
}
