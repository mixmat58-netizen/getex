const express = require("express");
const Call = require("../models/Call");
const { authMiddleware } = require("../middleware/auth");

const router = express.Router();

router.use(authMiddleware);

router.get("/calls", async (req, res, next) => {
  try {
    const calls = await Call.find({
      $or: [{ caller: req.user._id }, { receiver: req.user._id }],
    })
      .sort({ createdAt: -1 })
      .limit(100)
      .populate("caller", "name username avatar")
      .populate("receiver", "name username avatar");

    return res.json({
      calls: calls.map((call) => ({
        id: String(call._id),
        caller: {
          id: String(call.caller._id),
          name: call.caller.name,
          username: call.caller.username,
          avatar: call.caller.avatar,
        },
        receiver: {
          id: String(call.receiver._id),
          name: call.receiver.name,
          username: call.receiver.username,
          avatar: call.receiver.avatar,
        },
        type: call.type,
        status: call.status,
        createdAt: call.createdAt,
        endedAt: call.endedAt,
      })),
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = { callsRouter: router };

