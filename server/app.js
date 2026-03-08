const express = require("express");
const cors = require("cors");
const { env } = require("./config/env");
const { authRouter } = require("./routes/auth");
const { usersRouter } = require("./routes/users");
const { chatsRouter } = require("./routes/chats");
const { groupsRouter } = require("./routes/groups");
const { storiesRouter } = require("./routes/stories");
const { callsRouter } = require("./routes/calls");
const { errorMiddleware } = require("./middleware/error");

function corsOriginValidator(origin, callback) {
  if (env.corsOrigins.includes("*") || !origin || env.corsOrigins.includes(origin)) {
    callback(null, true);
    return;
  }

  callback(new Error("Not allowed by CORS"));
}

function createApiApp() {
  const app = express();

  app.use(
    cors({
      origin: corsOriginValidator,
      credentials: true,
    })
  );

  app.use(express.json({ limit: "50mb" }));

  app.get("/api/health", (req, res) => {
    res.json({ ok: true, time: new Date().toISOString() });
  });

  app.use("/api/auth", authRouter);
  app.use("/api/users", usersRouter);
  app.use("/api", chatsRouter);
  app.use("/api", groupsRouter);
  app.use("/api", storiesRouter);
  app.use("/api", callsRouter);

  app.use(errorMiddleware);

  return app;
}

module.exports = { createApiApp };
