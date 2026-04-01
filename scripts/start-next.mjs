import net from "node:net";
import { spawn } from "node:child_process";

const DEFAULT_PORT = Number(process.env.PORT || 3000);
const MAX_PORT = DEFAULT_PORT + 20;

function isPortFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });

    server.listen(port, "0.0.0.0");
  });
}

async function findAvailablePort(start, end) {
  for (let port = start; port <= end; port += 1) {
    // eslint-disable-next-line no-await-in-loop
    if (await isPortFree(port)) {
      return port;
    }
  }
  throw new Error(`No open port found between ${start} and ${end}.`);
}

async function main() {
  const port = await findAvailablePort(DEFAULT_PORT, MAX_PORT);

  if (port !== DEFAULT_PORT) {
    console.log(`Port ${DEFAULT_PORT} is in use. Starting Next.js on ${port} instead.`);
  }

  const child = spawn(
    process.execPath,
    ["./node_modules/next/dist/bin/next", "start", "-p", String(port)],
    {
      stdio: "inherit",
      env: {
        ...process.env,
        PORT: String(port),
      },
    },
  );

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 0);
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
