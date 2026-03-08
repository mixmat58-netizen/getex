const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
  {
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    receiverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    text: {
      type: String,
      default: "",
      trim: true,
      maxlength: 5000,
    },
    type: {
      type: String,
      enum: ["text", "voice", "image", "file", "video"],
      default: "text",
      required: true,
    },
    imageUrl: { type: String, default: "", trim: true },
    voiceUrl: { type: String, default: "", trim: true },
    videoUrl: { type: String, default: "", trim: true },
    fileUrl: { type: String, default: "", trim: true },
    fileName: { type: String, default: "", trim: true },
    fileSize: { type: String, default: "", trim: true },
    voiceDuration: { type: Number, default: 0, min: 0 },
    readAt: {
      type: Date,
      default: null,
      index: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    versionKey: false,
  }
);

messageSchema.index({ senderId: 1, receiverId: 1, createdAt: 1 });
messageSchema.index({ receiverId: 1, senderId: 1, createdAt: 1 });
messageSchema.index({ receiverId: 1, senderId: 1, readAt: 1, createdAt: 1 });

module.exports = mongoose.model("Message", messageSchema);
