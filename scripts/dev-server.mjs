import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, normalize } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import handler from "../netlify/functions/state.mjs";

const PORT = Number(process.env.PORT || 8888);
const PUBLIC_DIR = fileURLToPath(new URL("../public/", import.meta.url));

if (!process.env.ADMIN_PASSWORD) {
  process.env.ADMIN_PASSWORD = "Dragon";
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

    if (url.pathname === "/api/state" || url.pathname === "/.netlify/functions/state") {
      await handleApi(req, res, url);
      return;
    }

    await serveStatic(req, res, url);
  } catch (error) {
    res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    res.end(error.message || "Internal server error");
  }
});

server.listen(PORT, () => {
  console.log(`Leaderboard dev server running at http://localhost:${PORT}`);
  console.log("Local admin password: Dragon");
});

async function handleApi(req, res, url) {
  const body = ["GET", "HEAD"].includes(req.method || "GET") ? undefined : await readRequestBody(req);
  const request = new Request(url, {
    method: req.method,
    headers: req.headers,
    body
  });

  const response = await handler(request, {});
  const headers = Object.fromEntries(response.headers.entries());
  res.writeHead(response.status, headers);

  if (req.method === "HEAD") {
    res.end();
    return;
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  res.end(buffer);
}

async function serveStatic(req, res, url) {
  if (!["GET", "HEAD"].includes(req.method || "GET")) {
    res.writeHead(405, { "content-type": "text/plain; charset=utf-8" });
    res.end("Method not allowed");
    return;
  }

  const pathname = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const safePath = normalize(pathname).replace(/^(\.\.[/\\])+/, "");
  const fileUrl = pathToFileURL(`${PUBLIC_DIR}${safePath.startsWith("/") ? safePath.slice(1) : safePath}`);

  if (!fileURLToPath(fileUrl).startsWith(PUBLIC_DIR)) {
    res.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
    res.end("Forbidden");
    return;
  }

  try {
    const file = await readFile(fileUrl);
    res.writeHead(200, {
      "content-type": getContentType(extname(fileURLToPath(fileUrl))),
      "cache-control": "no-store"
    });
    res.end(req.method === "HEAD" ? undefined : file);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    const index = await readFile(new URL("../public/index.html", import.meta.url));
    res.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store"
    });
    res.end(req.method === "HEAD" ? undefined : index);
  }
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function getContentType(ext) {
  const types = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml"
  };
  return types[ext] || "application/octet-stream";
}
