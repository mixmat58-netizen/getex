const express = require("express");
const User = require("../models/User");
const { authMiddleware } = require("../middleware/auth");
const { hashPassword, comparePassword, formatPhoneForStorage } = require("../services/auth");
const { serializeUser } = require("./auth");

const router = express.Router();

router.use(authMiddleware);

router.get("/search", async (req, res, next) => {
  try {
    const query = String(req.query.q || "").trim();

    if (query.length < 2) {
      return res.json({ users: [] });
    }

    const phoneQuery = formatPhoneForStorage(query);
    const regex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");

    const users = await User.find({
      _id: { $ne: req.user._id },
      $or: [
        { username: regex },
        { phone: { $regex: phoneQuery || query } },
      ],
    })
      .limit(20)
      .sort({ username: 1 });

    return res.json({ users: users.map(serializeUser) });
  } catch (error) {
    return next(error);
  }
});

router.put("/profile", async (req, res, next) => {
  try {
    const updates = {};

    if (typeof req.body.name === "string") {
      const name = req.body.name.trim();
      if (!name) {
        return res.status(400).json({ error: "Name cannot be empty" });
      }
      updates.name = name;
    }

    if (typeof req.body.username === "string") {
      const username = req.body.username
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9_]/g, "");

      if (username.length < 3) {
        return res.status(400).json({ error: "Username must be at least 3 characters" });
      }

      const exists = await User.exists({ username, _id: { $ne: req.user._id } });
      if (exists) {
        return res.status(409).json({ error: "Username already taken" });
      }

      updates.username = username;
    }

    if (typeof req.body.bio === "string") {
      updates.bio = req.body.bio.trim().slice(0, 220);
    }

    if (typeof req.body.avatar === "string") {
      const avatar = req.body.avatar.trim();
      if (!avatar) {
        return res.status(400).json({ error: "Avatar cannot be empty" });
      }
      updates.avatar = avatar;
    }

    if (!Object.keys(updates).length) {
      return res.status(400).json({ error: "No changes provided" });
    }

    const updated = await User.findByIdAndUpdate(req.user._id, updates, { new: true });
    return res.json({ user: serializeUser(updated) });
  } catch (error) {
    return next(error);
  }
});

router.put("/password", async (req, res, next) => {
  try {
    const currentPassword = String(req.body.currentPassword || "");
    const newPassword = String(req.body.newPassword || "");

    if (newPassword.length < 8) {
      return res.status(400).json({ error: "New password must be at least 8 characters" });
    }

    const user = await User.findById(req.user._id).select("+passwordHash");
    const valid = await comparePassword(currentPassword, user.passwordHash);

    if (!valid) {
      return res.status(400).json({ error: "Current password is incorrect" });
    }

    user.passwordHash = await hashPassword(newPassword);
    await user.save();

    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
});

module.exports = { usersRouter: router };

