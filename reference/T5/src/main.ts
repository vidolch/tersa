import { startHttp } from "./http/server.ts";
import { fileStore } from "./storage/file.ts";
import { memoryStore } from "./storage/memory.ts";
import type { LinkStore } from "./storage/types.ts";

const port = Number(process.env.PORT ?? 3000);
const dataDir = process.env.DATA_DIR ?? "./data";
const mode = process.env.STORAGE || "file";

let store: LinkStore;
if (mode === "file") store = fileStore(dataDir);
else if (mode === "memory") store = memoryStore();
else {
  console.error(`invalid STORAGE=${mode}; expected "file" or "memory"`);
  process.exit(2);
}

const server = startHttp(store, port);
const shutdown = () => {
  server.close(() => (store.close(), process.exit(0)));
  server.closeAllConnections();
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
