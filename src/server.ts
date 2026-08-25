import http from "node:http";
import { Store } from "./store.ts";
import { createApp } from "./app.ts";
import { DATA_DIR } from "./config.ts";

const port = Number(process.env.PORT || 8080);
const store = new Store(DATA_DIR);

http.createServer(createApp(store)).listen(port, () => {
	console.log(`betmas-id-manager listening on :${port} (data: ${DATA_DIR})`);
});
