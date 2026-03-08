const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const host = process.env.HOST || "0.0.0.0";
const rawOrigins = process.env.APP_ORIGIN || "*";
const corsOrigins = rawOrigins
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  host,
  port: Number(process.env.PORT || 3000),
  httpsEnabled: String(process.env.HTTPS || "true").toLowerCase() !== "false",
  tlsKeyPath: process.env.SSL_KEY_PATH || path.resolve(process.cwd(), ".cert", "localhost-key.pem"),
  tlsCertPath: process.env.SSL_CERT_PATH || path.resolve(process.cwd(), ".cert", "localhost-cert.pem"),
  jwtSecret: process.env.JWT_SECRET || "change-this-secret",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",
  mongoUri: process.env.MONGO_URI || "",
  corsOrigins: corsOrigins.length ? corsOrigins : ["*"],
};

module.exports = { env };
