const http = require("http");
const https = require("https");
const next = require("next");
const { env } = require("./config/env");
const { connectDatabase, closeDatabase } = require("./db");
const { createApiApp } = require("./app");
const { createSocketServer } = require("./services/socket");
const { loadOrCreateCertificate } = require("./services/tls");

const dev = env.nodeEnv !== "production";
const app = next({ dev });
const handle = app.getRequestHandler();

async function start() {
  const databaseUri = await connectDatabase();
  await app.prepare();

  const apiApp = createApiApp();

  const requestHandler = (req, res) => {
    if ((req.url || "").startsWith("/api/")) {
      apiApp(req, res);
      return;
    }

    handle(req, res);
  };

  let server;
  let protocol = "http";

  if (env.httpsEnabled) {
    const certificate = loadOrCreateCertificate({
      host: env.host,
      keyPath: env.tlsKeyPath,
      certPath: env.tlsCertPath,
    });

    server = https.createServer(
      {
        key: certificate.key,
        cert: certificate.cert,
      },
      requestHandler
    );

    protocol = "https";

    if (certificate.created) {
      console.log(`Generated local TLS certificate at ${env.tlsCertPath}`);
    }
  } else {
    server = http.createServer(requestHandler);
  }

  createSocketServer(server);

  server.listen(env.port, env.host, () => {
    const localUrl = `${protocol}://localhost:${env.port}`;
    const hostUrl = `${protocol}://${env.host}:${env.port}`;

    console.log(`Getex running at ${localUrl}`);

    if (env.host !== "localhost" && env.host !== "127.0.0.1") {
      console.log(`External access enabled at ${hostUrl}`);
    }

    if (!env.mongoUri) {
      console.log("Using in-memory MongoDB instance");
    }

    console.log(`Mongo connected: ${databaseUri}`);
  });

  const shutdown = async () => {
    console.log("Shutting down...");
    server.close(async () => {
      await closeDatabase();
      process.exit(0);
    });
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

start().catch((error) => {
  console.error("Failed to start server", error);
  process.exit(1);
});
