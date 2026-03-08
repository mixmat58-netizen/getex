const User = require("../models/User");
const Session = require("../models/Session");
const { verifyToken } = require("../services/auth");

async function authMiddleware(req, res, next) {
  try {
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";

    if (!token) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const payload = verifyToken(token);

    const [user, session] = await Promise.all([
      User.findById(payload.sub),
      Session.findOne({ jti: payload.jti, revokedAt: null }),
    ]);

    if (!user || !session || String(session.userId) !== String(user._id)) {
      return res.status(401).json({ error: "Session expired" });
    }

    session.lastActiveAt = new Date();
    await session.save();

    req.user = user;
    req.session = session;
    req.tokenPayload = payload;
    next();
  } catch (error) {
    return res.status(401).json({ error: "Unauthorized" });
  }
}

module.exports = { authMiddleware };

