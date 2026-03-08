const express = require("express");
const mongoose = require("mongoose");
const Message = require("../models/Message");
const User = require("../models/User");
const DirectChat = require("../models/DirectChat");
const { authMiddleware } = require("../middleware/auth");
const { isOnline } = require("../services/presence");

const router = express.Router();

router.use(authMiddleware);

const ALLOWED_MESSAGE_TYPES = ["text", "voice", "image", "file", "video"];

function serializeMessage(message) {
  return {
    id: String(message._id),
    senderId: String(message.senderId),
    receiverId: String(message.receiverId),
    text: message.text,
    type: message.type,
    imageUrl: message.imageUrl,
    voiceUrl: message.voiceUrl,
    videoUrl: message.videoUrl,
    fileUrl: message.fileUrl,
    fileName: message.fileName,
    fileSize: message.fileSize,
    voiceDuration: message.voiceDuration,
    readAt: message.readAt,
    createdAt: message.createdAt,
  };
}

function getChatKey(userAId, userBId) {
  return [String(userAId), String(userBId)].sort().join(":");
}

function isValidObjectId(value) {
  return mongoose.Types.ObjectId.isValid(String(value || ""));
}

async function ensureDirectChat(userAId, userBId, options = {}) {
  const chatKey = getChatKey(userAId, userBId);
  const update = options.touch ? { $set: { updatedAt: new Date() } } : {};

  const chat = await DirectChat.findOneAndUpdate(
    { chatKey },
    {
      $setOnInsert: {
        participants: [userAId, userBId],
        chatKey,
      },
      ...update,
    },
    {
      upsert: true,
      new: true,
    }
  );

  return chat;
}

function validatePayloadByType({ type, text, imageUrl, voiceUrl, videoUrl, fileUrl }) {
  if (!ALLOWED_MESSAGE_TYPES.includes(type)) {
    return "Invalid message type";
  }

  if (type === "text" && !text) return "Message text cannot be empty";
  if (type === "image" && !imageUrl) return "Image payload is required";
  if (type === "voice" && !voiceUrl) return "Voice payload is required";
  if (type === "video" && !videoUrl) return "Video payload is required";
  if (type === "file" && !fileUrl) return "File payload is required";

  return "";
}

async function resolveChatPartner(rawUserId, currentUserId) {
  const partnerId = String(rawUserId || "");

  if (!partnerId) {
    return { error: { status: 400, message: "userId is required" } };
  }

  if (!isValidObjectId(partnerId)) {
    return { error: { status: 400, message: "userId is invalid" } };
  }

  if (partnerId === String(currentUserId)) {
    return { error: { status: 400, message: "Cannot start chat with yourself" } };
  }

  const user = await User.findById(partnerId);
  if (!user) {
    return { error: { status: 404, message: "User not found" } };
  }

  return {
    partnerId,
    partnerObjectId: user._id,
    user,
  };
}

async function markMessagesAsRead(currentUserId, partnerId) {
  const readAt = new Date();
  await Message.updateMany(
    {
      senderId: partnerId,
      receiverId: currentUserId,
      readAt: null,
    },
    {
      $set: { readAt },
    }
  );
}

router.post("/chats/start", async (req, res, next) => {
  try {
    const resolved = await resolveChatPartner(req.body.userId, req.user._id);
    if (resolved.error) {
      return res.status(resolved.error.status).json({ error: resolved.error.message });
    }

    const { partnerId, user: targetUser } = resolved;
    const chat = await ensureDirectChat(req.user._id, partnerId);

    return res.json({
      chat: {
        id: String(chat._id),
        user: {
          id: String(targetUser._id),
          username: targetUser.username,
          name: targetUser.name,
          phone: targetUser.phone,
          avatar: targetUser.avatar,
          bio: targetUser.bio,
          online: isOnline(targetUser._id),
        },
      },
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/chats", async (req, res, next) => {
  try {
    const currentUserId = String(req.user._id);

    const directChats = await DirectChat.find({ participants: req.user._id }).sort({ updatedAt: -1 });

    const partnerIdsFromChats = directChats
      .map((chat) => {
        const [a, b] = chat.participants.map(String);
        return a === currentUserId ? b : a;
      })
      .filter((partnerId) => partnerId && partnerId !== currentUserId);

    const messagePartners = await Message.aggregate([
      {
        $match: {
          $or: [{ senderId: req.user._id }, { receiverId: req.user._id }],
        },
      },
      {
        $project: {
          partnerId: {
            $cond: [{ $eq: ["$senderId", req.user._id] }, "$receiverId", "$senderId"],
          },
        },
      },
      { $group: { _id: "$partnerId" } },
    ]);

    const allPartnerIds = Array.from(
      new Set([...partnerIdsFromChats, ...messagePartners.map((item) => String(item._id))])
    ).filter((partnerId) => partnerId && partnerId !== currentUserId && isValidObjectId(partnerId));

    const users = await User.find({ _id: { $in: allPartnerIds } });
    const validPartnerIds = users.map((user) => String(user._id));
    const usersById = new Map(users.map((user) => [String(user._id), user]));

    await Promise.all(
      validPartnerIds.map(async (partnerId) => {
        await ensureDirectChat(req.user._id, partnerId);
      })
    );

    const chatsAfterSync = await DirectChat.find({ participants: req.user._id }).sort({ updatedAt: -1 });

    const chats = await Promise.all(
      chatsAfterSync.map(async (chat) => {
        const [a, b] = chat.participants.map(String);
        const partnerId = a === currentUserId ? b : a;
        const partner = usersById.get(partnerId) || (await User.findById(partnerId));
        if (!partner) return null;

        const [lastMessage, unread] = await Promise.all([
          Message.findOne({
            $or: [
              { senderId: req.user._id, receiverId: partner._id },
              { senderId: partner._id, receiverId: req.user._id },
            ],
          }).sort({ createdAt: -1 }),
          Message.countDocuments({
            senderId: partner._id,
            receiverId: req.user._id,
            readAt: null,
          }),
        ]);

        const fallbackCreatedAt = chat.updatedAt || chat.createdAt;
        const serializedLastMessage = lastMessage
          ? serializeMessage(lastMessage)
          : {
              id: `draft-${String(chat._id)}`,
              senderId: String(req.user._id),
              receiverId: String(partner._id),
              text: "",
              type: "text",
              imageUrl: "",
              voiceUrl: "",
              videoUrl: "",
              fileUrl: "",
              fileName: "",
              fileSize: "",
              voiceDuration: 0,
              readAt: null,
              createdAt: fallbackCreatedAt,
            };

        return {
          user: {
            id: String(partner._id),
            username: partner.username,
            name: partner.name,
            phone: partner.phone,
            avatar: partner.avatar,
            bio: partner.bio,
            online: isOnline(partner._id),
          },
          unread,
          lastMessage: serializedLastMessage,
          updatedAt: serializedLastMessage.createdAt,
        };
      })
    );

    const sorted = chats
      .filter(Boolean)
      .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())
      .map(({ updatedAt, ...rest }) => rest);

    return res.json({ chats: sorted });
  } catch (error) {
    return next(error);
  }
});

router.get("/messages/:userId", async (req, res, next) => {
  try {
    const resolved = await resolveChatPartner(req.params.userId, req.user._id);
    if (resolved.error) {
      return res.status(resolved.error.status).json({ error: resolved.error.message });
    }

    const currentUserId = req.user._id;
    const { partnerId, partnerObjectId } = resolved;

    await ensureDirectChat(currentUserId, partnerId);
    await markMessagesAsRead(currentUserId, partnerObjectId);

    const messages = await Message.find({
      $or: [
        { senderId: currentUserId, receiverId: partnerObjectId },
        { senderId: partnerObjectId, receiverId: currentUserId },
      ],
    })
      .sort({ createdAt: 1 })
      .limit(300);

    return res.json({ messages: messages.map(serializeMessage) });
  } catch (error) {
    return next(error);
  }
});

router.post("/messages", async (req, res, next) => {
  try {
    const receiverId = String(req.body.receiverId || "");
    const text = String(req.body.text || "").trim();
    const type = String(req.body.type || "text");
    const imageUrl = String(req.body.imageUrl || "");
    const voiceUrl = String(req.body.voiceUrl || "");
    const videoUrl = String(req.body.videoUrl || "");
    const fileUrl = String(req.body.fileUrl || "");

    if (!receiverId) {
      return res.status(400).json({ error: "receiverId is required" });
    }

    if (!isValidObjectId(receiverId)) {
      return res.status(400).json({ error: "receiverId is invalid" });
    }

    if (receiverId === String(req.user._id)) {
      return res.status(400).json({ error: "Cannot send message to yourself" });
    }

    const receiver = await User.findById(receiverId);
    if (!receiver) {
      return res.status(404).json({ error: "User not found" });
    }

    const payloadError = validatePayloadByType({ type, text, imageUrl, voiceUrl, videoUrl, fileUrl });
    if (payloadError) {
      return res.status(400).json({ error: payloadError });
    }

    await ensureDirectChat(req.user._id, receiver._id, { touch: true });

    const message = await Message.create({
      senderId: req.user._id,
      receiverId: receiver._id,
      text,
      type,
      imageUrl,
      voiceUrl,
      videoUrl,
      fileUrl,
      fileName: req.body.fileName || "",
      fileSize: req.body.fileSize || "",
      voiceDuration: Number(req.body.voiceDuration || 0),
    });

    return res.status(201).json({ message: serializeMessage(message) });
  } catch (error) {
    return next(error);
  }
});

module.exports = { chatsRouter: router, serializeMessage, ensureDirectChat, getChatKey, ALLOWED_MESSAGE_TYPES };
