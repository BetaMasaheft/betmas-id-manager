/**
 * Thin XML helpers shared by store.ts - slimdom for the DOM (parsing,
 * building, serializing), fontoxpath for querying it.
 */
import * as slimdom from "slimdom";
import fontoxpath from "fontoxpath";
import type { IssuedIdRecord } from "./types.ts";

const { evaluateXPath, evaluateXPathToFirstNode } = fontoxpath;

export function parseXml(xmlString: string): slimdom.Document {
	return slimdom.parseXmlDocument(xmlString);
}

export function serializeXml(node: slimdom.Node): string {
	return slimdom.serializeToWellFormedString(node);
}

export { evaluateXPath, evaluateXPathToFirstNode };

/**
 * Turn a parsed <issued-id> document into the same plain-object shape the
 * original XQuery's local:to-map produced - optional attributes (prefix,
 * sequence, suffix) are only present in the result when they exist on the
 * element, matching the manual vs. auto id shapes exactly. The cast is the
 * one deliberate trust boundary here: it holds because put() below is the
 * only writer of these files, and always writes one of the two shapes.
 */
const ISSUED_ID_RECORD_XPATH = `
	map:merge((
		map { "id": string(/issued-id/@id) },
		map { "type": string(/issued-id/@type) },
		map { "mode": string(/issued-id/@mode) },
		map { "createdAt": string(/issued-id/@createdAt) },
		if (/issued-id/@prefix) then map { "prefix": string(/issued-id/@prefix) } else (),
		if (/issued-id/@sequence) then map { "sequence": xs:integer(/issued-id/@sequence) } else (),
		if (/issued-id/@suffix) then map { "suffix": string(/issued-id/@suffix) } else ()
	))
`;

export function issuedIdToRecord(doc: slimdom.Document): IssuedIdRecord {
	return evaluateXPath(ISSUED_ID_RECORD_XPATH, doc) as IssuedIdRecord;
}
