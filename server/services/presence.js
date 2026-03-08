const onlineUsers = new Map();

function addSocket(userId, socketId) {
  const key = String(userId);
  if (!onlineUsers.has(key)) {
    onlineUsers.set(key, new Set());
  }
  onlineUsers.get(key).add(socketId);
}

function removeSocket(userId, socketId) {
  const key = String(userId);
  const sockets = onlineUsers.get(key);
  if (!sockets) return;
  sockets.delete(socketId);
  if (sockets.size === 0) {
    onlineUsers.delete(key);
  }
}

function isOnline(userId) {
  return onlineUsers.has(String(userId));
}

function getUserSocketIds(userId) {
  return Array.from(onlineUsers.get(String(userId)) || []);
}

module.exports = {
  addSocket,
  removeSocket,
  isOnline,
  getUserSocketIds,
};

