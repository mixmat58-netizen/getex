const express = require("express");
const Group = require("../models/Group");
const GroupMessage = require("../models/GroupMessage");
const User = require("../models/User");
const { authMiddleware } = require("../middleware/auth");

const router = express.Router();

const ALLOWED_GROUP_MESSAGE_TYPES = ["text", "voice", "image", "file", "video"];

function serializeGroupMessage(message) {
  return {
    id: String(message._id),
    groupId: String(message.groupId),
    senderId: String(message.senderId),
    text: message.text,
    type: message.type,
    imageUrl: message.imageUrl,
    voiceUrl: message.voiceUrl,
    videoUrl: message.videoUrl,
    fileUrl: message.fileUrl,
    fileName: message.fileName,
    fileSize: message.fileSize,
    voiceDuration: message.voiceDuration,
    sender:
      message.senderId && typeof message.senderId === "object"
        ? {
            id: String(message.senderId._id || message.senderId.id),
            name: message.senderId.name || "",
            username: message.senderId.username || "",
            avatar: message.senderId.avatar || "",
          }
        : null,
    createdAt: message.createdAt,
  };
}

function validateGroupMessage(payload) {
  const type = String(payload.type || "text");
  const text = String(payload.text || "").trim();
  const imageUrl = String(payload.imageUrl || "");
  const voiceUrl = String(payload.voiceUrl || "");
  const videoUrl = String(payload.videoUrl || "");
  const fileUrl = String(payload.fileUrl || "");

  if (!ALLOWED_GROUP_MESSAGE_TYPES.includes(type)) {
    return "Invalid message type";
  }

  if (type === "text" && !text) return "Message text cannot be empty";
  if (type === "image" && !imageUrl) return "Image payload is required";
  if (type === "voice" && !voiceUrl) return "Voice payload is required";
  if (type === "video" && !videoUrl) return "Video payload is required";
  if (type === "file" && !fileUrl) return "File payload is required";

  return "";
}

router.use(authMiddleware);

router.get("/groups", async (req, res, next) => {
  try {
    const kind = req.query.kind === "channel" ? "channel" : req.query.kind === "group" ? "group" : "";
    const query = { members: req.user._id };
    if (kind) {
      query.kind = kind;
    }

    const groups = await Group.find(query).sort({ updatedAt: -1 });

    const result = await Promise.all(
      groups.map(async (group) => {
        const lastMessage = await GroupMessage.findOne({ groupId: group._id }).sort({ createdAt: -1 });

        return {
          id: String(group._id),
          kind: group.kind,
          name: group.name,
          avatar: group.avatar,
          members: group.members.map(String),
          memberCount: group.members.length,
          updatedAt: group.updatedAt,
          lastMessage: lastMessage ? serializeGroupMessage(lastMessage) : null,
          unread: 0,
        };
      })
    );

    return res.json({ groups: result });
  } catch (error) {
    return next(error);
  }
});

router.post("/groups", async (req, res, next) => {
  try {
    const name = String(req.body.name || "").trim();
    const avatar = String(req.body.avatar || "").trim() || "/placeholder-user.jpg";
    const kind = req.body.kind === "channel" ? "channel" : "group";
    const rawMembers = Array.isArray(req.body.memberIds) ? req.body.memberIds.map(String) : [];

    if (!name) {
      return res.status(400).json({ error: "Group name is required" });
    }

    const uniqueMembers = Array.from(new Set([String(req.user._id), ...rawMembers]));

    const existingUsers = await User.find({ _id: { $in: uniqueMembers } });
    const existingIds = new Set(existingUsers.map((user) => String(user._id)));

    const members = uniqueMembers.filter((id) => existingIds.has(id));

    const group = await Group.create({
      kind,
      name,
      avatar,
      createdBy: req.user._id,
      members,
    });

    return res.status(201).json({
      group: {
        id: String(group._id),
        kind: group.kind,
        name: group.name,
        avatar: group.avatar,
        members: group.members.map(String),
        memberCount: group.members.length,
        updatedAt: group.updatedAt,
      },
    });
  } catch (error) {
    return next(error);
  }
});

router.put("/groups/:groupId/avatar", async (req, res, next) => {
  try {
    const avatar = String(req.body.avatar || "").trim();
    if (!avatar) {
      return res.status(400).json({ error: "Avatar is required" });
    }

    const group = await Group.findOne({
      _id: req.params.groupId,
      members: req.user._id,
    });

    if (!group) {
      return res.status(404).json({ error: "Group not found" });
    }

    group.avatar = avatar;
    await group.save();

    return res.json({ group: { id: String(group._id), avatar: group.avatar } });
  } catch (error) {
    return next(error);
  }
});

router.get("/groups/:groupId/messages", async (req, res, next) => {
  try {
    const group = await Group.findOne({
      _id: req.params.groupId,
      members: req.user._id,
    });

    if (!group) {
      return res.status(404).json({ error: "Group not found" });
    }

    const messages = await GroupMessage.find({ groupId: group._id })
      .sort({ createdAt: 1 })
      .limit(300)
      .populate("senderId", "name username avatar");

    return res.json({ messages: messages.map(serializeGroupMessage) });
  } catch (error) {
    return next(error);
  }
});

router.post("/groups/:groupId/messages", async (req, res, next) => {
  try {
    const group = await Group.findOne({
      _id: req.params.groupId,
      members: req.user._id,
    });

    if (!group) {
      return res.status(404).json({ error: "Group not found" });
    }

    const payloadError = validateGroupMessage(req.body);
    if (payloadError) {
      return res.status(400).json({ error: payloadError });
    }

    const message = await GroupMessage.create({
      groupId: group._id,
      senderId: req.user._id,
      text: String(req.body.text || "").trim(),
      type: String(req.body.type || "text"),
      imageUrl: String(req.body.imageUrl || ""),
      voiceUrl: String(req.body.voiceUrl || ""),
      videoUrl: String(req.body.videoUrl || ""),
      fileUrl: String(req.body.fileUrl || ""),
      fileName: String(req.body.fileName || ""),
      fileSize: String(req.body.fileSize || ""),
      voiceDuration: Number(req.body.voiceDuration || 0),
    });

    const populated = await GroupMessage.findById(message._id).populate("senderId", "name username avatar");
    return res.status(201).json({ message: serializeGroupMessage(populated) });
  } catch (error) {
    return next(error);
  }
});

module.exports = { groupsRouter: router, serializeGroupMessage, ALLOWED_GROUP_MESSAGE_TYPES };
