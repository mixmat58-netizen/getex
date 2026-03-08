const mongoose = require("mongoose");

const groupSchema = new mongoose.Schema(
  {
    kind: {
      type: String,
      enum: ["group", "channel"],
      default: "group",
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
    },
    avatar: {
      type: String,
      default: "/placeholder-user.jpg",
      trim: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    members: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: "User",
      required: true,
      default: [],
    },
  },
  {
    timestamps: { createdAt: "createdAt", updatedAt: "updatedAt" },
    versionKey: false,
  }
);

groupSchema.index({ members: 1 });

module.exports = mongoose.model("Group", groupSchema);
