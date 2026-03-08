const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { env } = require("../config/env");
const Session = require("../models/Session");

function normalizePhone(value) {
  return String(value || "").replace(/\D/g, "");
}

function formatPhoneForStorage(value) {
  const digits = normalizePhone(value);
  if (!digits) return "";
  if (digits.startsWith("8") && digits.length === 11) {
    return `7${digits.slice(1)}`;
  }
  if (digits.startsWith("7") && digits.length === 11) {
    return digits;
  }
  if (digits.length === 10) {
    return `7${digits}`;
  }
  return digits;
}

function isPhoneIdentifier(identifier) {
  const value = String(identifier || "").trim();
  if (!value) return false;

  const compact = value.replace(/[\s()+-]/g, "");
  return /^\d{10,15}$/.test(compact);
}

async function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

async function comparePassword(password, hash) {
  if (!hash) return false;
  if (!String(hash).startsWith("$2")) {
    return String(password) === String(hash);
  }
  return bcrypt.compare(password, hash);
}

function signToken(payload) {
  return jwt.sign(payload, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn,
  });
}

function verifyToken(token) {
  return jwt.verify(token, env.jwtSecret);
}

async function createSessionAndToken({ userId, userAgent, ip }) {
  const jti = crypto.randomUUID();

  await Session.create({
    userId,
    jti,
    userAgent,
    ip,
  });

  const token = signToken({ sub: String(userId), jti });
  return { token, jti };
}

module.exports = {
  normalizePhone,
  formatPhoneForStorage,
  isPhoneIdentifier,
  hashPassword,
  comparePassword,
  verifyToken,
  createSessionAndToken,
};