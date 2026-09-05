const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = 6969;
const MINI_PLAYER_DIR = path.join(__dirname, "mini-player");
const OBS_WIDGET_DIR = path.join(__dirname, "obs");
const APP_ROOT_DIR = path.join(__dirname, "..");

let server;
let currentState = {
  spiceServer: true,
  protocolVersion: 1,
  track: null,
  currentTime: 0,
  paused: true,
  volume: 1.0,
  shuffle: false,
  repeat: "off",
};

let controlCallback = null;

// --- MIME map ---
const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
};

// --- App UI route mapping ---
// These files live in project root: /spice
const APP_UI_FILES = {
  "/": "index.html",
  "/index.html": "index.html",
  "/settings": "settings.html",
  "/settings.html": "settings.html",
  "/toolbar-icons": "toolbar-icons.html",
  "/toolbar-icons.html": "toolbar-icons.html",
  "/lyrics": "lyrics.html",
  "/lyrics.html": "lyrics.html",
  "/queue": "queue.html",
  "/queue.html": "queue.html",
  "/styles.css": "styles.css",
  "/lyrics-core.js": "lyrics-core.js",
  "/lyrics.js": "lyrics.js",
  "/icon.png": "icon.png",
};

function setCorsHeaders(res) {
  // Keep broad CORS for mini-player and local API usability
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
  });
  res.end(JSON.stringify(data));
}

function sendText(res, statusCode, text) {
  res.writeHead(statusCode, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(text);
}

function serveFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const type = contentTypes[ext] || "application/octet-stream";

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === "ENOENT") {
        sendText(res, 404, "404 Not Found");
      } else {
        sendText(res, 500, "500 Server Error");
      }
      return;
    }

    res.writeHead(200, { "Content-Type": type });
    res.end(content);
  });
}

function safeJoin(baseDir, requestPath) {
  const normalized = path.normalize(requestPath).replace(/^(\.\.[/\\])+/, "");
  return path.join(baseDir, normalized);
}

function handleApi(req, res, pathname) {
  if (pathname === "/api/status" && req.method === "GET") {
    return sendJson(res, 200, currentState);
  }

  if (pathname === "/api/control" && req.method === "POST") {
    // Same-machine check: any website the user visits can reach
    // http://localhost:6969, and the preflight handler answers ACAO *, so a
    // foreign Origin must not drive playback/window control. Browser clients
    // always send Origin (non-browser clients like curl send none).
    const origin = req.headers.origin;
    if (origin) {
      let originHost = "";
      try {
        originHost = new URL(origin).hostname;
      } catch (parseError) {
        return sendText(res, 403, "403 Forbidden");
      }
      if (originHost !== "localhost" && originHost !== "127.0.0.1") {
        return sendText(res, 403, "403 Forbidden");
      }
    }
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
      // Basic body size guard
      if (body.length > 1024 * 1024) {
        req.destroy();
      }
    });

    req.on("end", () => {
      try {
        const data = JSON.parse(body || "{}");
        if (controlCallback) controlCallback(data);
        sendJson(res, 200, { success: true });
      } catch (e) {
        sendText(res, 400, "Invalid JSON");
      }
    });

    return;
  }

  sendText(res, 404, "404 Not Found");
}

function handleMiniPlayerStatic(res, req, pathname) {
  // Redirect /mini-player (no trailing slash) -> /mini-player/
  // so that relative assets (styles.css, script.js) resolve correctly.
  if (pathname === "/mini-player") {
    const qs = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
    res.writeHead(301, { Location: "/mini-player/" + qs });
    res.end();
    return;
  }

  // /mini-player/ -> index.html, /mini-player/foo.js -> foo.js, etc.
  const rel =
    pathname === "/mini-player/"
      ? "/index.html"
      : pathname.replace(/^\/mini-player/, "");

  const filePath = safeJoin(MINI_PLAYER_DIR, rel);

  // Anti-directory traversal
  if (!filePath.startsWith(MINI_PLAYER_DIR)) {
    return sendText(res, 403, "403 Forbidden");
  }

  serveFile(res, filePath);
}

function handleObsWidgetStatic(res, req, pathname) {
  if (pathname === "/obs") {
    const qs = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
    res.writeHead(301, { Location: "/obs/" + qs });
    res.end();
    return;
  }

  const rel =
    pathname === "/obs/"
      ? "/index.html"
      : pathname.replace(/^\/obs/, "");

  const filePath = safeJoin(OBS_WIDGET_DIR, rel);

  if (!filePath.startsWith(OBS_WIDGET_DIR)) {
    return sendText(res, 403, "403 Forbidden");
  }

  serveFile(res, filePath);
}

function handleAppUiStatic(res, pathname) {
  const mapped = APP_UI_FILES[pathname];
  if (!mapped) {
    return false;
  }

  const filePath = path.join(APP_ROOT_DIR, mapped);

  // Safety check (should always pass due to map)
  if (!filePath.startsWith(APP_ROOT_DIR)) {
    sendText(res, 403, "403 Forbidden");
    return true;
  }

  serveFile(res, filePath);
  return true;
}

function startServer(callback) {
  // If already running, only refresh callback
  controlCallback = callback || controlCallback;

  if (server) return Promise.resolve();

  return new Promise((resolve, reject) => {
    let settled = false;

    const onListening = () => {
      if (settled) return;
      settled = true;
      resolve();
    };

    const onError = (err) => {
      if (settled) return;
      settled = true;
      reject(err);
    };

    server = http.createServer((req, res) => {
      setCorsHeaders(res);

      if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
      }

      const host = req.headers.host || `localhost:${PORT}`;
      const parsed = new URL(req.url, `http://${host}`);
      const pathname = parsed.pathname;

      // API endpoints
      if (pathname.startsWith("/api/")) {
        return handleApi(req, res, pathname);
      }

      // Mini-player static: /mini-player, /mini-player/, /mini-player/*
      if (
        pathname === "/mini-player" ||
        pathname === "/mini-player/" ||
        pathname.startsWith("/mini-player/")
      ) {
        return handleMiniPlayerStatic(res, req, pathname);
      }

      // OBS widget static: /obs, /obs/, /obs/*
      if (
        pathname === "/obs" ||
        pathname === "/obs/" ||
        pathname.startsWith("/obs/")
      ) {
        return handleObsWidgetStatic(res, req, pathname);
      }

      // App UI static routes
      if (handleAppUiStatic(res, pathname)) {
        return;
      }

      sendText(res, 404, "404 Not Found");
    });

    server.once("listening", onListening);
    server.once("error", onError);

    // Loopback only: this is a local companion server (mini-player, OBS,
    // queue windows). The default binds all interfaces, exposing playback
    // control and listening activity to every host on the LAN.
    server.listen(PORT, "127.0.0.1", () => {
      console.log(`[Server] Running on http://localhost:${PORT}`);
      console.log(`[Server] Main UI:      http://localhost:${PORT}/`);
      console.log(
        `[Server] Mini Player:  http://localhost:${PORT}/mini-player/`,
      );
      console.log(`[Server] OBS Widget:   http://localhost:${PORT}/obs/`);
      console.log(`[Server] Settings:     http://localhost:${PORT}/settings`);
      console.log(`[Server] Lyrics:       http://localhost:${PORT}/lyrics`);
      console.log(`[Server] API Status:   http://localhost:${PORT}/api/status`);
    });

    // Keep runtime logging after startup as well
    server.on("error", (err) => {
      console.error("[Server] Error:", err.message);
    });
  });
}

function updateState(newState) {
  currentState = { ...currentState, ...newState };
}

module.exports = { startServer, updateState };
