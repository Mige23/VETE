"use strict";

var http = require("http");
var fs = require("fs");
var path = require("path");

var root = path.resolve(__dirname, "..");
var port = Number(process.env.PETSGATES_MOCK_PORT || 8766);
var mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp"
};

function readBody(request, callback) {
  var body = "";
  request.on("data", function (chunk) { body += chunk; });
  request.on("end", function () {
    try { callback(JSON.parse(body || "{}")); } catch (error) { callback({}); }
  });
}

function sendSse(response, event, payload) {
  response.write("event: " + event + "\n");
  response.write("data: " + JSON.stringify(payload) + "\n\n");
}

http.createServer(function (request, response) {
  var urlPath = decodeURIComponent((request.url || "/").split("?")[0]);

  if (urlPath === "/api/session.php" && request.method === "POST") {
    response.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Set-Cookie": "pg_chat_session=mock; Path=/; HttpOnly; SameSite=Strict"
    });
    response.end(JSON.stringify({ ok: true, csrf: "mock-csrf", expiresIn: 3600 }));
    return;
  }

  if (urlPath === "/api/chat.php" && request.method === "POST") {
    readBody(request, function (payload) {
      response.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-store",
        "Connection": "keep-alive"
      });
      sendSse(response, "ready", { requestId: "mock" });
      var emergency = /no respira|convulsi|sangrado/i.test(String(payload.message || ""));
      var chunks = emergency
        ? ["Esto puede ser una urgencia. ", "Contactá ahora mismo a una guardia veterinaria 24/7. ", "No le des medicación humana y trasladalo de forma segura."]
        : ["En Petsgates podemos orientarte sobre cuidados preventivos y servicios. ", "Para reservar una cita, usá WhatsApp o el formulario disponible debajo del chat. ", "La confirmación final la realiza el equipo de la clínica."];
      if (emergency) sendSse(response, "meta", { emergency: true });
      var index = 0;
      var timer = setInterval(function () {
        if (index < chunks.length) {
          sendSse(response, "delta", { text: chunks[index++] });
          return;
        }
        clearInterval(timer);
        sendSse(response, "done", { finishReason: emergency ? "EMERGENCY_PROTOCOL" : "STOP" });
        response.end();
      }, 180);
    });
    return;
  }

  if (urlPath === "/api/health.php") {
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    response.end(JSON.stringify({ ok: true, service: "petsgates-chat-mock", configured: true, model: "mock" }));
    return;
  }

  var relative = urlPath === "/" ? "index.html" : urlPath.replace(/^\/+/, "");
  var file = path.resolve(root, relative);
  if (file.indexOf(root) !== 0) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  fs.stat(file, function (error, stats) {
    if (error || !stats.isFile()) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }
    response.writeHead(200, {
      "Content-Type": mime[path.extname(file).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-store"
    });
    fs.createReadStream(file).pipe(response);
  });
}).listen(port, "127.0.0.1", function () {
  process.stdout.write("Petsgates chat mock: http://127.0.0.1:" + port + "/\n");
});

