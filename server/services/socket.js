const mongoose = require("mongoose");
const { Server } = require("socket.io");
const User = require("../models/User");
const Session = require("../models/Session");
const Message = require("../models/Message");
const Call = require("../models/Call");
const DirectChat = require("../models/DirectChat");
const Group = require("../models/Group");
const GroupMessage = require("../models/GroupMessage");
const { env } = require("../config/env");
const { verifyToken } = require("./auth");
const { addSocket, removeSocket, getUserSocketIds } = require("./presence");

const ALLOWED_MESSAGE_TYPES = ["text", "voice", "image", "file", "video"];

function emitToUser(io, userId, event, payload) {
  const sockets = getUserSocketIds(userId);
  sockets.forEach((socketId) => {
    io.to(socketId).emit(event, payload);
  });
}

function socketCorsValidator(origin, callback) {
  if (env.corsOrigins.includes("*") || !origin || env.corsOrigins.includes(origin)) {
    callback(null, true);
    return;
  }

  callback(new Error("Not allowed by CORS"));
}

function isValidObjectId(value) {
  return mongoose.Types.ObjectId.isValid(String(value || ""));
}

function getChatKey(userAId, userBId) {
  return [String(userAId), String(userBId)].sort().join(":");
}

async function touchDirectChat(userAId, userBId) {
  const chatKey = getChatKey(userAId, userBId);
  return DirectChat.findOneAndUpdate(
    { chatKey },
    {
      $setOnInsert: {
        participants: [userAId, userBId],
        chatKey,
      },
      $set: {
        updatedAt: new Date(),
      },
    },
    {
      upsert: true,
      new: true,
    }
  );
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

function serializeGroupMessage(message, sender) {
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
    sender: sender
      ? {
          id: String(sender._id || sender.id),
          name: sender.name || "",
          username: sender.username || "",
          avatar: sender.avatar || "",
        }
      : null,
    createdAt: message.createdAt,
  };
}

async function ensureExistingUser(userId, currentUserId) {
  if (!userId) {
    throw new Error("receiverId is required");
  }

  if (!isValidObjectId(userId)) {
    throw new Error("receiverId is invalid");
  }

  if (String(userId) === String(currentUserId)) {
    throw new Error("Cannot target yourself");
  }

  const user = await User.findById(userId).select("name username avatar");
  if (!user) {
    throw new Error("User not found");
  }

  return user;
}

async function findCallForParticipant(callId, currentUserId, options = {}) {
  if (!callId) {
    throw new Error("callId is required");
  }

  if (!isValidObjectId(callId)) {
    throw new Error("callId is invalid");
  }

  const query = options.populate
    ? Call.findById(callId).populate("caller", "name username avatar").populate("receiver", "name username avatar")
    : Call.findById(callId);

  const call = await query;
  if (!call) {
    throw new Error("Call not found");
  }

  const callerId = String(options.populate ? call.caller._id : call.caller);
  const receiverId = String(options.populate ? call.receiver._id : call.receiver);

  if (![callerId, receiverId].includes(String(currentUserId))) {
    throw new Error("Forbidden");
  }

  return call;
}

async function closeActiveCallsForUser(io, userId) {
  const activeCalls = await Call.find({
    status: { $in: ["ringing", "connected"] },
    $or: [{ caller: userId }, { receiver: userId }],
  });

  await Promise.all(
    activeCalls.map(async (call) => {
      if (call.status === "ringing") {
        call.status = String(call.caller) === String(userId) ? "cancelled" : "missed";
      } else {
        call.status = "ended";
      }

      call.endedAt = new Date();
      await call.save();

      const eventPayload = {
        callId: String(call._id),
        by: String(userId),
        status: call.status,
      };

      emitToUser(io, String(call.caller), "call:ended", eventPayload);
      emitToUser(io, String(call.receiver), "call:ended", eventPayload);
    })
  );
}

function createSocketServer(httpServer) {
  const io = new Server(httpServer, {
    path: "/socket.io",
    cors: {
      origin: socketCorsValidator,
      credentials: true,
    },
  });

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token || "";
      if (!token) {
        return next(new Error("Unauthorized"));
      }

      const payload = verifyToken(token);

      const [user, session] = await Promise.all([
        User.findById(payload.sub),
        Session.findOne({ jti: payload.jti, revokedAt: null }),
      ]);

      if (!user || !session || String(session.userId) !== String(user._id)) {
        return next(new Error("Unauthorized"));
      }

      session.lastActiveAt = new Date();
      await session.save();

      socket.data.user = user;
      socket.data.session = session;
      return next();
    } catch (error) {
      return next(new Error("Unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    const currentUser = socket.data.user;
    const currentUserId = String(currentUser._id);
    addSocket(currentUserId, socket.id);

    socket.broadcast.emit("presence:update", {
      userId: currentUserId,
      online: true,
    });

    socket.on("message:send", async (payload, callback) => {
      try {
        const receiverId = String(payload?.receiverId || "");
        const type = String(payload?.type || "text");
        const text = String(payload?.text || "").trim();
        const imageUrl = String(payload?.imageUrl || "");
        const voiceUrl = String(payload?.voiceUrl || "");
        const videoUrl = String(payload?.videoUrl || "");
        const fileUrl = String(payload?.fileUrl || "");

        await ensureExistingUser(receiverId, currentUserId);

        const payloadError = validatePayloadByType({ type, text, imageUrl, voiceUrl, videoUrl, fileUrl });
        if (payloadError) {
          throw new Error(payloadError);
        }

        await touchDirectChat(currentUserId, receiverId);

        const message = await Message.create({
          senderId: currentUserId,
          receiverId,
          text,
          type,
          imageUrl,
          voiceUrl,
          videoUrl,
          fileUrl,
          fileName: String(payload?.fileName || ""),
          fileSize: String(payload?.fileSize || ""),
          voiceDuration: Number(payload?.voiceDuration || 0),
        });

        const serialized = serializeMessage(message);

        emitToUser(io, receiverId, "message:new", serialized);
        emitToUser(io, currentUserId, "message:new", serialized);

        if (callback) callback({ ok: true, message: serialized });
      } catch (error) {
        if (callback) callback({ ok: false, error: error.message });
      }
    });

    socket.on("group:join", async ({ groupId } = {}, callback) => {
      try {
        const id = String(groupId || "");
        if (!id) throw new Error("groupId is required");
        if (!isValidObjectId(id)) throw new Error("groupId is invalid");

        const group = await Group.findOne({ _id: id, members: currentUserId });
        if (!group) throw new Error("Group not found");

        socket.join(`group:${id}`);
        if (callback) callback({ ok: true });
      } catch (error) {
        if (callback) callback({ ok: false, error: error.message });
      }
    });

    socket.on("group:leave", ({ groupId } = {}, callback) => {
      const id = String(groupId || "");
      if (id) {
        socket.leave(`group:${id}`);
      }
      if (callback) callback({ ok: true });
    });

    socket.on("group:message:send", async (payload, callback) => {
      try {
        const groupId = String(payload?.groupId || "");
        const type = String(payload?.type || "text");
        const text = String(payload?.text || "").trim();
        const imageUrl = String(payload?.imageUrl || "");
        const voiceUrl = String(payload?.voiceUrl || "");
        const videoUrl = String(payload?.videoUrl || "");
        const fileUrl = String(payload?.fileUrl || "");

        if (!groupId) {
          throw new Error("groupId is required");
        }

        if (!isValidObjectId(groupId)) {
          throw new Error("groupId is invalid");
        }

        const payloadError = validatePayloadByType({ type, text, imageUrl, voiceUrl, videoUrl, fileUrl });
        if (payloadError) {
          throw new Error(payloadError);
        }

        const group = await Group.findOne({
          _id: groupId,
          members: currentUserId,
        });

        if (!group) {
          throw new Error("Group not found");
        }

        const message = await GroupMessage.create({
          groupId,
          senderId: currentUserId,
          text,
          type,
          imageUrl,
          voiceUrl,
          videoUrl,
          fileUrl,
          fileName: String(payload?.fileName || ""),
          fileSize: String(payload?.fileSize || ""),
          voiceDuration: Number(payload?.voiceDuration || 0),
        });

        group.updatedAt = new Date();
        await group.save();

        const serialized = serializeGroupMessage(message, currentUser);

        io.to(`group:${groupId}`).emit("group:message:new", serialized);

        group.members.forEach((memberId) => {
          emitToUser(io, String(memberId), "group:message:new", serialized);
        });

        if (callback) callback({ ok: true, message: serialized });
      } catch (error) {
        if (callback) callback({ ok: false, error: error.message });
      }
    });

    socket.on("typing:start", (payload = {}) => {
      const receiverId = String(payload.receiverId || "");
      if (!receiverId || !isValidObjectId(receiverId)) return;
      emitToUser(io, receiverId, "typing:start", {
        userId: currentUserId,
      });
    });

    socket.on("typing:stop", (payload = {}) => {
      const receiverId = String(payload.receiverId || "");
      if (!receiverId || !isValidObjectId(receiverId)) return;
      emitToUser(io, receiverId, "typing:stop", {
        userId: currentUserId,
      });
    });

    socket.on("call:start", async (payload, callback) => {
      try {
        const receiverId = String(payload?.receiverId || "");
        const type = payload?.type === "video" ? "video" : "voice";
        const receiver = await ensureExistingUser(receiverId, currentUserId);

        const call = await Call.create({
          caller: currentUserId,
          receiver: receiver._id,
          type,
          status: "ringing",
        });

        const callPayload = {
          callId: String(call._id),
          from: {
            id: currentUserId,
            name: currentUser.name,
            username: currentUser.username,
            avatar: currentUser.avatar,
          },
          to: {
            id: String(receiver._id),
            name: receiver.name,
            username: receiver.username,
            avatar: receiver.avatar,
          },
          type,
          status: call.status,
          createdAt: call.createdAt,
        };

        emitToUser(io, String(receiver._id), "call:incoming", callPayload);
        emitToUser(io, currentUserId, "call:outgoing", callPayload);

        if (callback) callback({ ok: true, call: callPayload });
      } catch (error) {
        if (callback) callback({ ok: false, error: error.message });
      }
    });

    socket.on("call:accept", async (payload, callback) => {
      try {
        const callId = String(payload?.callId || "");
        const call = await findCallForParticipant(callId, currentUserId, { populate: true });

        if (String(call.receiver._id) !== currentUserId) throw new Error("Forbidden");

        call.status = "connected";
        await call.save();

        const callPayload = {
          callId: String(call._id),
          from: {
            id: String(call.caller._id),
            name: call.caller.name,
            username: call.caller.username,
            avatar: call.caller.avatar,
          },
          to: {
            id: String(call.receiver._id),
            name: call.receiver.name,
            username: call.receiver.username,
            avatar: call.receiver.avatar,
          },
          type: call.type,
          status: call.status,
          createdAt: call.createdAt,
        };

        emitToUser(io, String(call.caller._id), "call:accepted", callPayload);
        emitToUser(io, String(call.receiver._id), "call:accepted", callPayload);

        if (callback) callback({ ok: true, call: callPayload });
      } catch (error) {
        if (callback) callback({ ok: false, error: error.message });
      }
    });

    socket.on("call:decline", async (payload, callback) => {
      try {
        const callId = String(payload?.callId || "");
        const call = await findCallForParticipant(callId, currentUserId);

        call.status = "declined";
        call.endedAt = new Date();
        await call.save();

        const eventPayload = {
          callId: String(call._id),
          by: currentUserId,
          status: call.status,
        };

        emitToUser(io, String(call.caller), "call:declined", eventPayload);
        emitToUser(io, String(call.receiver), "call:declined", eventPayload);

        if (callback) callback({ ok: true });
      } catch (error) {
        if (callback) callback({ ok: false, error: error.message });
      }
    });

    socket.on("call:end", async (payload, callback) => {
      try {
        const callId = String(payload?.callId || "");
        const call = await findCallForParticipant(callId, currentUserId);

        if (call.status === "ringing") {
          call.status = String(call.caller) === currentUserId ? "cancelled" : "missed";
        } else {
          call.status = "ended";
        }

        call.endedAt = new Date();
        await call.save();

        const eventPayload = {
          callId: String(call._id),
          by: currentUserId,
          status: call.status,
        };

        emitToUser(io, String(call.caller), "call:ended", eventPayload);
        emitToUser(io, String(call.receiver), "call:ended", eventPayload);

        if (callback) callback({ ok: true });
      } catch (error) {
        if (callback) callback({ ok: false, error: error.message });
      }
    });

    const relayWebRtc = (eventName) => {
      socket.on(eventName, async (payload, callback) => {
        try {
          const callId = String(payload?.callId || "");
          const call = await findCallForParticipant(callId, currentUserId);

          const participants = [String(call.caller), String(call.receiver)];
          const targetUserId = participants.find((id) => id !== currentUserId);
          emitToUser(io, targetUserId, eventName, {
            callId,
            fromUserId: currentUserId,
            data: payload?.data,
          });

          if (callback) callback({ ok: true });
        } catch (error) {
          if (callback) callback({ ok: false, error: error.message });
        }
      });
    };

    relayWebRtc("webrtc:offer");
    relayWebRtc("webrtc:answer");
    relayWebRtc("webrtc:media-state");
    relayWebRtc("webrtc:ice-candidate");

    socket.on("disconnect", async () => {
      removeSocket(currentUserId, socket.id);
      const hasActiveSockets = getUserSocketIds(currentUserId).length > 0;
      if (!hasActiveSockets) {
        await closeActiveCallsForUser(io, currentUserId);
        socket.broadcast.emit("presence:update", {
          userId: currentUserId,
          online: false,
        });
      }
    });
  });

  return io;
}

module.exports = { createSocketServer, emitToUser };
