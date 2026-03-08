const mongoose = require("mongoose");

const directChatSchema = new mongoose.Schema(
  {
    participants: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: "User",
      required: true,
      validate: {
        validator(value) {
          return Array.isArray(value) && value.length === 2;
        },
        message: "Direct chat must have exactly 2 participants",
      },
    },
    chatKey: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
  },
  {
    timestamps: { createdAt: "createdAt", updatedAt: "updatedAt" },
    versionKey: false,
  }
);

module.exports = mongoose.model("DirectChat", directChatSchema);
