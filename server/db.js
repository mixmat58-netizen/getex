const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const { env } = require("./config/env");

let memoryServer;

async function connectDatabase() {
  if (env.nodeEnv === "production" && !env.mongoUri) {
    throw new Error("MONGO_URI is required in production");
  }

  const uri = env.mongoUri || (await createMemoryUri());

  await mongoose.connect(uri, {
    dbName: process.env.MONGO_DB_NAME || "getex",
  });

  return uri;
}

async function createMemoryUri() {
  if (!memoryServer) {
    memoryServer = await MongoMemoryServer.create({
      instance: { dbName: "getex" },
    });
  }

  return memoryServer.getUri();
}

async function closeDatabase() {
  await mongoose.connection.close();
  if (memoryServer) {
    await memoryServer.stop();
    memoryServer = null;
  }
}

module.exports = { connectDatabase, closeDatabase };

