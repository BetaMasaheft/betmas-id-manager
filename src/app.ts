/**
 * Thin HTTP wrapper over ids.ts - mirrors modules/api.xql + controller.xql.
 * Hand-rolled routing on node:http rather than a framework: six routes
 * don't need one.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createIdService } from "./ids.ts";
import type { IdService } from "./ids.ts";
import { HttpError, BadRequestError, NotFoundError } from "./errors.ts";
import type { Store } from "./store.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API_JSON_PATH = path.join(__dirname, "..", "api.json");

const CORS_HEADERS: Record<string, string> = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Credentials": "true",
	"Access-Control-Allow-Methods": "GET, POST, DELETE, PUT, PATCH, OPTIONS",
	"Access-Control-Allow-Headers": "Accept, Content-Type, Authorization, X-Start",
	"Cache-Control": "no-cache",
};

function readBody(req: IncomingMessage): Promise<string> {
	return new Promise((resolve, reject) => {
		let data = "";
		req.on("data", (chunk) => (data += chunk));
		req.on("end", () => resolve(data));
		req.on("error", reject);
	});
}

function parseJsonBody(raw: string): any {
	if (!raw || !raw.trim()) return {};
	try {
		return JSON.parse(raw);
	} catch {
		throw new BadRequestError("invalid JSON body");
	}
}

type RouteHandler = (params: string[], query: URLSearchParams, body: any) => unknown;

interface Route {
	method: string;
	pattern: RegExp;
	status: number;
	handler: RouteHandler;
}

function routesFor(ids: IdService): Route[] {
	return [
		{ method: "GET", pattern: /^\/types$/, status: 200, handler: () => ids.listTypes() },
		{
			method: "POST",
			pattern: /^\/ids\/([^/]+)$/,
			status: 201,
			handler: ([type], _query, body) => ids.reserveId(decodeURIComponent(type), body),
		},
		{
			method: "GET",
			pattern: /^\/id\/([^/]+)$/,
			status: 200,
			handler: ([id]) => {
				const decoded = decodeURIComponent(id);
				const record = ids.getId(decoded);
				if (!record) throw new NotFoundError(`unknown id: ${decoded}`);
				return record;
			},
		},
		{
			method: "GET",
			pattern: /^\/ids$/,
			status: 200,
			handler: (_params, query) => ids.listIds(query.get("type")),
		},
		{
			method: "POST",
			pattern: /^\/types\/([^/]+)\/reset$/,
			status: 200,
			handler: ([type], _query, body) => {
				const value = body?.value == null ? undefined : Number(body.value);
				return ids.resetType(decodeURIComponent(type), value);
			},
		},
		{
			method: "POST",
			pattern: /^\/types\/([^/]+)\/seed$/,
			status: 200,
			handler: ([type], _query, body) => ids.seedManualIds(decodeURIComponent(type), body?.ids),
		},
	];
}

export function createApp(store: Store): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
	const ids = createIdService(store);
	const routes = routesFor(ids);

	return async function handleRequest(req, res) {
		const start = performance.now();
		const url = new URL(req.url ?? "/", "http://localhost");
		res.on("finish", () => {
			const ms = (performance.now() - start).toFixed(1);
			console.log(`${req.method} ${url.pathname} ${res.statusCode} ${ms}ms`);
		});

		for (const [name, value] of Object.entries(CORS_HEADERS)) res.setHeader(name, value);

		if (req.method === "OPTIONS") {
			res.writeHead(204);
			res.end();
			return;
		}

		if (req.method === "GET" && url.pathname === "/api.json") {
			res.writeHead(200, { "Content-Type": "application/json" });
			res.end(fs.readFileSync(API_JSON_PATH));
			return;
		}

		try {
			const route = routes.find((r) => r.method === req.method && r.pattern.test(url.pathname));
			if (!route) throw new NotFoundError(`no such route: ${req.method} ${url.pathname}`);

			const params = route.pattern.exec(url.pathname)!.slice(1);
			const raw = req.method === "GET" ? "" : await readBody(req);
			const body = req.method === "GET" ? undefined : parseJsonBody(raw);

			const result = route.handler(params, url.searchParams, body);
			res.writeHead(route.status, { "Content-Type": "application/json" });
			res.end(JSON.stringify(result));
		} catch (err) {
			const status = err instanceof HttpError ? err.status : 500;
			if (status === 500) console.error(err);
			res.writeHead(status, { "Content-Type": "application/json" });
			res.end(JSON.stringify({ error: status === 500 ? "internal server error" : (err as Error).message }));
		}
	};
}
