import { createServer } from "node:http";
import { createReadStream, statSync } from "node:fs";
import { resolve, extname, sep } from "node:path";
const root = resolve("dist/browser");
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".woff2": "font/woff2",
};
const server = createServer((req, res) => {
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; style-src 'self'; frame-ancestors 'none'; base-uri 'self'",
  );
  res.setHeader("X-Content-Type-Options", "nosniff");
  try {
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405);
      res.end();
      return;
    }
    const pathname = decodeURIComponent(
      new URL(req.url, "http://localhost").pathname,
    );
    let path = resolve(root, "." + pathname);
    if (path !== root && !path.startsWith(root + sep)) {
      res.writeHead(403);
      res.end();
      return;
    }
    if (["/", "/calculator", "/cipher", "/words"].includes(pathname))
      path = resolve(root, "index.html");
    if (!statSync(path).isFile()) throw new Error("Not found");
    res.setHeader(
      "Content-Type",
      mime[extname(path)] || "application/octet-stream",
    );
    if (req.method === "HEAD") res.end();
    else
      createReadStream(path)
        .on("error", () => res.destroy())
        .pipe(res);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
});
server.listen(5104, "127.0.0.1", () =>
  console.log("Smallwork preview: http://127.0.0.1:5104"),
);
