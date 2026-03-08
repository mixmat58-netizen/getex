const express = require("express");
const mongoose = require("mongoose");
const Story = require("../models/Story");
const User = require("../models/User");
const DirectChat = require("../models/DirectChat");
const { authMiddleware } = require("../middleware/auth");

const router = express.Router();

const STORY_LIFETIME_MS = 24 * 60 * 60 * 1000;

function serializeStory(story, currentUserId) {
  return {
    id: String(story._id),
    type: story.type,
    mediaUrl: story.mediaUrl,
    createdAt: story.createdAt,
    viewed: story.viewedBy.some((viewerId) => String(viewerId) === String(currentUserId)),
  };
}

function isValidObjectId(value) {
  return mongoose.Types.ObjectId.isValid(String(value || ""));
}

function getChatKey(userAId, userBId) {
  return [String(userAId), String(userBId)].sort().join(":");
}

router.use(authMiddleware);

router.get("/stories", async (req, res, next) => {
  try {
    const now = new Date();
    const currentUserId = String(req.user._id);

    await Story.deleteMany({ expiresAt: { $lte: now } });

    const directChats = await DirectChat.find({ participants: req.user._id });

    const partnerIds = directChats
      .map((chat) => chat.participants.map(String).find((id) => id !== currentUserId))
      .filter(Boolean);

    const relatedUserIds = Array.from(new Set([currentUserId, ...partnerIds]));

    const [users, stories] = await Promise.all([
      User.find({ _id: { $in: relatedUserIds } }),
      Story.find({
        userId: { $in: relatedUserIds },
        expiresAt: { $gt: now },
      }).sort({ createdAt: 1 }),
    ]);

    const usersById = new Map(users.map((user) => [String(user._id), user]));
    const storiesByUser = new Map();

    stories.forEach((story) => {
      const userId = String(story.userId);
      const bucket = storiesByUser.get(userId) || [];
      bucket.push(serializeStory(story, currentUserId));
      storiesByUser.set(userId, bucket);
    });

    const result = Array.from(storiesByUser.entries())
      .map(([userId, userStories]) => {
        const user = usersById.get(userId);
        if (!user) return null;

        const isOwn = userId === currentUserId;
        const viewed = userStories.every((story) => story.viewed);

        return {
          id: userId,
          name: user.name,
          avatar: user.avatar,
          isOwn,
          viewed,
          stories: userStories,
        };
      })
      .filter(Boolean)
      .sort((left, right) => {
        if (left.isOwn && !right.isOwn) return -1;
        if (!left.isOwn && right.isOwn) return 1;
        if (left.viewed !== right.viewed) {
          return left.viewed ? 1 : -1;
        }

        const leftTime = new Date(left.stories[left.stories.length - 1].createdAt).getTime();
        const rightTime = new Date(right.stories[right.stories.length - 1].createdAt).getTime();
        return rightTime - leftTime;
      });

    return res.json({ stories: result });
  } catch (error) {
    return next(error);
  }
});

router.post("/stories", async (req, res, next) => {
  try {
    const type = String(req.body.type || "").trim();
    const mediaUrl = String(req.body.mediaUrl || "").trim();

    if (!["image", "video"].includes(type)) {
      return res.status(400).json({ error: "Story type must be image or video" });
    }

    if (!mediaUrl) {
      return res.status(400).json({ error: "mediaUrl is required" });
    }

    const story = await Story.create({
      userId: req.user._id,
      type,
      mediaUrl,
      viewedBy: [req.user._id],
      expiresAt: new Date(Date.now() + STORY_LIFETIME_MS),
    });

    return res.status(201).json({
      story: {
        id: String(story._id),
        type: story.type,
        mediaUrl: story.mediaUrl,
        createdAt: story.createdAt,
        viewed: true,
      },
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/stories/:storyId/view", async (req, res, next) => {
  try {
    const storyId = String(req.params.storyId || "");

    if (!storyId) {
      return res.status(400).json({ error: "storyId is required" });
    }

    if (!isValidObjectId(storyId)) {
      return res.status(400).json({ error: "storyId is invalid" });
    }

    const story = await Story.findOne({
      _id: storyId,
      expiresAt: { $gt: new Date() },
    });

    if (!story) {
      return res.status(404).json({ error: "Story not found" });
    }

    const currentUserId = String(req.user._id);
    const storyOwnerId = String(story.userId);

    if (storyOwnerId !== currentUserId) {
      const directChat = await DirectChat.findOne({
        chatKey: getChatKey(currentUserId, storyOwnerId),
      }).select("_id");

      if (!directChat) {
        return res.status(403).json({ error: "Story is not available" });
      }
    }

    const alreadyViewed = story.viewedBy.some((viewerId) => String(viewerId) === currentUserId);
    if (!alreadyViewed) {
      story.viewedBy.push(req.user._id);
      await story.save();
    }

    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
});

module.exports = { storiesRouter: router };
