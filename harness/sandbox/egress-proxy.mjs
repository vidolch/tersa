// Allowlist HTTPS proxy for the agent phase. The agent's processes can only
// reach the network through this proxy (a firewall blocks everything else for
// the agent user), and the proxy only tunnels to the hosts listed here.
// Usage: node egress-proxy.mjs <port> <host[,host...]> <log-file>
import { createServer } from "node:http";
import { connect } from "node:net";
import { appendFileSync } from "node:fs";

const [port, hostsArg, log] = process.argv.slice(2);
const allowed = new Set(hostsArg.split(",").map((h) => h.trim().toLowerCase()).filter(Boolean));
const record = (line) => appendFileSync(log, `${new Date().toISOString()} ${line}\n`);

const server = createServer((req, res) => {
  // Plain-HTTP proxying is never needed (provider APIs are HTTPS): refuse.
  record(`DENY http ${req.method} ${req.url}`);
  res.writeHead(403).end("blocked by benchmark egress policy\n");
});

server.on("connect", (req, client, head) => {
  const [host, portStr] = String(req.url).split(":");
  const target = host.toLowerCase();
  if (!allowed.has(target) || (portStr ?? "443") !== "443") {
    record(`DENY connect ${req.url}`);
    client.end("HTTP/1.1 403 Forbidden\r\n\r\n");
    return;
  }
  record(`ALLOW connect ${req.url}`);
  const upstream = connect(443, target, () => {
    client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
    if (head?.length) upstream.write(head);
    upstream.pipe(client);
    client.pipe(upstream);
  });
  const close = () => { upstream.destroy(); client.destroy(); };
  upstream.on("error", close);
  client.on("error", close);
});

server.listen(Number(port), "127.0.0.1", () => record(`listening on ${port}, allow ${[...allowed].join(",")}`));
