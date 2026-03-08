const express = require("express");
const crypto = require("crypto");
const User = require("../models/User");
const Session = require("../models/Session");
const QrLoginChallenge = require("../models/QrLoginChallenge");
const {
  formatPhoneForStorage,
  isPhoneIdentifier,
  hashPassword,
  comparePassword,
  createSessionAndToken,
} = require("../services/auth");
const { authMiddleware } = require("../middleware/auth");

const router = express.Router();
const QR_TTL_MS = 2 * 60 * 1000;

function serializeUser(user) {
  return {
    id: String(user._id),
    username: user.username,
    name: user.name,
    phone: user.phone,
    avatar: user.avatar,
    bio: user.bio,
    createdAt: user.createdAt,
  };
}

function parseQrCode(raw) {
  const value = String(raw || "").trim();
  const [challengeId = "", secret = ""] = value.split(".");
  return { challengeId, secret };
}

router.get("/check-username", async (req, res, next) => {
  try {
    const username = String(req.query.username || "")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9_]/g, "");

    if (username.length < 3) {
      return res.json({ available: false });
    }

    const exists = await User.exists({ username });
    return res.json({ available: !exists });
  } catch (error) {
    return next(error);
  }
});

router.post("/register", async (req, res, next) => {
  try {
    const username = String(req.body.username || "")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9_]/g, "");
    const name = String(req.body.name || "").trim();
    const phone = formatPhoneForStorage(req.body.phone);
    const password = String(req.body.password || "");

    if (!username || username.length < 3) {
      return res.status(400).json({ error: "Username must be at least 3 characters" });
    }

    if (!name) {
      return res.status(400).json({ error: "Name is required" });
    }

    if (!phone || phone.length < 11) {
      return res.status(400).json({ error: "Phone is invalid" });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters" });
    }

    const [usernameTaken, phoneTaken] = await Promise.all([User.exists({ username }), User.exists({ phone })]);

    if (usernameTaken) {
      return res.status(409).json({ error: "Username already taken" });
    }

    if (phoneTaken) {
      return res.status(409).json({ error: "Phone already used" });
    }

    const user = await User.create({
      username,
      name,
      phone,
      passwordHash: await hashPassword(password),
    });

    const { token } = await createSessionAndToken({
      userId: user._id,
      userAgent: req.headers["user-agent"] || "unknown",
      ip: req.ip,
    });

    return res.status(201).json({
      token,
      user: serializeUser(user),
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/login", async (req, res, next) => {
  try {
    const identifier = String(req.body.identifier || "").trim();
    const password = String(req.body.password || "");

    if (!identifier || !password) {
      return res.status(400).json({ error: "Identifier and password are required" });
    }

    const normalizedUsername = identifier.replace(/^@/, "").toLowerCase();
    const normalizedPhone = formatPhoneForStorage(identifier);

    const looksLikePhone = isPhoneIdentifier(identifier);
    let user = null;

    if (looksLikePhone) {
      user = await User.findOne({ phone: normalizedPhone }).select("+passwordHash");
      if (!user) {
        user = await User.findOne({ username: normalizedUsername }).select("+passwordHash");
      }
    } else {
      user = await User.findOne({ username: normalizedUsername }).select("+passwordHash");
      if (!user && normalizedPhone && isPhoneIdentifier(normalizedPhone)) {
        user = await User.findOne({ phone: normalizedPhone }).select("+passwordHash");
      }
    }

    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const valid = await comparePassword(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const { token } = await createSessionAndToken({
      userId: user._id,
      userAgent: req.headers["user-agent"] || "unknown",
      ip: req.ip,
    });

    return res.json({
      token,
      user: serializeUser(user),
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/qr/request", async (req, res, next) => {
  try {
    const challengeId = crypto.randomUUID();
    const secret = crypto.randomBytes(20).toString("hex");
    const expiresAt = new Date(Date.now() + QR_TTL_MS);

    await QrLoginChallenge.create({
      challengeId,
      secret,
      status: "pending",
      expiresAt,
    });

    return res.status(201).json({
      challengeId,
      secret,
      code: `${challengeId}.${secret}`,
      expiresAt,
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/qr/status/:challengeId", async (req, res, next) => {
  try {
    const challengeId = String(req.params.challengeId || "").trim();
    const secret = String(req.query.secret || "").trim();

    if (!challengeId || !secret) {
      return res.status(400).json({ error: "challengeId and secret are required" });
    }

    const challenge = await QrLoginChallenge.findOne({ challengeId, secret });
    if (!challenge) {
      return res.status(404).json({ error: "QR challenge not found" });
    }

    if (challenge.expiresAt.getTime() <= Date.now()) {
      if (challenge.status !== "expired") {
        challenge.status = "expired";
        await challenge.save();
      }
      return res.json({ status: "expired", expiresAt: challenge.expiresAt });
    }

    if (challenge.status === "consumed") {
      return res.json({ status: "consumed", expiresAt: challenge.expiresAt });
    }

    if (challenge.status !== "approved" || !challenge.approvedBy) {
      return res.json({ status: "pending", expiresAt: challenge.expiresAt });
    }

    const user = await User.findById(challenge.approvedBy);
    if (!user) {
      return res.status(404).json({ error: "Approver user not found" });
    }

    const { token } = await createSessionAndToken({
      userId: user._id,
      userAgent: req.headers["user-agent"] || "unknown",
      ip: req.ip,
    });

    challenge.status = "consumed";
    challenge.consumedAt = new Date();
    await challenge.save();

    return res.json({
      status: "approved",
      token,
      user: serializeUser(user),
      expiresAt: challenge.expiresAt,
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/qr/approve", authMiddleware, async (req, res, next) => {
  try {
    const inputCode = String(req.body.code || "").trim();
    const parsed = inputCode
      ? parseQrCode(inputCode)
      : {
          challengeId: String(req.body.challengeId || "").trim(),
          secret: String(req.body.secret || "").trim(),
        };

    if (!parsed.challengeId || !parsed.secret) {
      return res.status(400).json({ error: "QR code is invalid" });
    }

    const challenge = await QrLoginChallenge.findOne({ challengeId: parsed.challengeId, secret: parsed.secret });
    if (!challenge) {
      return res.status(404).json({ error: "QR challenge not found" });
    }

    if (challenge.expiresAt.getTime() <= Date.now()) {
      challenge.status = "expired";
      await challenge.save();
      return res.status(410).json({ error: "QR challenge expired" });
    }

    if (challenge.status === "consumed") {
      return res.status(409).json({ error: "QR challenge already consumed" });
    }

    challenge.status = "approved";
    challenge.approvedBy = req.user._id;
    challenge.approvedAt = new Date();
    await challenge.save();

    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
});

router.post("/logout", authMiddleware, async (req, res, next) => {
  try {
    req.session.revokedAt = new Date();
    await req.session.save();
    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
});

router.get("/me", authMiddleware, async (req, res) => {
  return res.json({ user: serializeUser(req.user) });
});

router.get("/sessions", authMiddleware, async (req, res, next) => {
  try {
    const sessions = await Session.find({ userId: req.user._id, revokedAt: null }).sort({ createdAt: -1 });

    return res.json({
      sessions: sessions.map((session) => ({
        id: String(session._id),
        userAgent: session.userAgent,
        ip: session.ip,
        lastActiveAt: session.lastActiveAt,
        createdAt: session.createdAt,
        isCurrent: String(session._id) === String(req.session._id),
      })),
    });
  } catch (error) {
    return next(error);
  }
});

router.delete("/sessions/:sessionId", authMiddleware, async (req, res, next) => {
  try {
    const target = await Session.findOne({
      _id: req.params.sessionId,
      userId: req.user._id,
      revokedAt: null,
    });

    if (!target) {
      return res.status(404).json({ error: "Session not found" });
    }

    target.revokedAt = new Date();
    await target.save();

    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
});

router.post("/sessions/revoke-others", authMiddleware, async (req, res, next) => {
  try {
    await Session.updateMany(
      {
        userId: req.user._id,
        revokedAt: null,
        _id: { $ne: req.session._id },
      },
      {
        $set: { revokedAt: new Date() },
      }
    );

    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
});

module.exports = { authRouter: router, serializeUser };
