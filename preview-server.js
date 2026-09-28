"use strict";

var http = require("http");
var fs = require("fs");
var path = require("path");

var root = __dirname;
var port = Number(process.env.PORT || process.env.PETSGATES_PORT || 8765);
var mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".txt": "text/plain; charset=utf-8"
};

http.createServer(function (request, response) {
  var urlPath;

  try {
    urlPath = decodeURIComponent((request.url || "/").split("?")[0]);
  } catch (error) {
    response.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Bad request");
    return;
  }

  var relative = urlPath === "/" ? "index.html" : urlPath.replace(/^\/+/, "");
  var file = path.resolve(root, relative);

  if (file.indexOf(root + path.sep) !== 0 || path.basename(file).charAt(0) === ".") {
    response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Forbidden");
    return;
  }

  fs.stat(file, function (statError, stats) {
    if (statError || !stats.isFile()) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }

    response.writeHead(200, {
      "Content-Type": mime[path.extname(file).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    });
    fs.createReadStream(file).pipe(response);
  });
}).listen(port, "0.0.0.0", function () {
  process.stdout.write("Petsgates preview: http://127.0.0.1:" + port + "/\n");
});
