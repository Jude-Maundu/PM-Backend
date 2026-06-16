import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import Conversation from "../models/Conversation.js";
import User from "../models/users.js";

// In-memory maps for presence tracking
const userSockets = new Map(); // userId -> Set<socketId>
const socketUsers = new Map(); // socketId -> userId
const socketRoles = new Map(); // socketId -> role
const STAFF_ROOMS = ["admin", "reviewer", "support", "secretary", "engineer", "marketing"];

let io;
let staffRefreshInterval = null;

export function initializeSocket(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: [
        "http://localhost:3000",
        "http://localhost:3001",
        "https://pm-frontend-3buw.onrender.com",
        "https://pm-frontend-f3b6.onrender.com",
      ],
      methods: ["GET", "POST"],
      credentials: true,
    },
    transports: ["websocket", "polling"],
  });

  // Auth middleware
  io.use(async (socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.query?.token;

      if (!token) {
        return next(new Error("Authentication token required"));
      }

      const payload = jwt.verify(token, process.env.JWT_SECRET);
      const userId = payload?.userId?.toString() ||
        payload?.id?.toString() ||
        payload?._id?.toString();

      if (!userId) {
        return next(new Error("Invalid token payload"));
      }

      socket.userId = userId;
      socket.username = payload?.username || payload?.email || "";
      socket.role = payload?.role || "";
      next();
    } catch (err) {
      console.error("[socket] Auth error:", err.message);
      next(new Error("Invalid or expired token"));
    }
  });

  io.on("connection", async (socket) => {
    const userId = socket.userId;
    console.log(`[socket] User connected: ${userId} (${socket.id})`);

    // Track presence
    if (!userSockets.has(userId)) {
      userSockets.set(userId, new Set());
    }
    userSockets.get(userId).add(socket.id);
    socketUsers.set(socket.id, userId);
    socketRoles.set(socket.id, socket.role || "");

    if (socket.role) {
      socket.join(`role:${socket.role}`);
      if (STAFF_ROOMS.includes(socket.role)) {
        socket.emit("staff:dashboard:refresh", {
          role: socket.role,
          timestamp: new Date().toISOString(),
          reason: "connected",
        });
      }
    }

    // Broadcast online status
    socket.broadcast.emit("user_online", { userId });

    // Join all conversation rooms for this user
    try {
      const conversations = await Conversation.find({
        participants: userId,
        archivedBy: { $ne: userId },
      }).select("_id");

      const roomIds = conversations.map((c) => c._id.toString());
      roomIds.forEach((roomId) => {
        socket.join(`conversation:${roomId}`);
      });

      console.log(`[socket] ${userId} joined ${roomIds.length} conversation rooms`);
    } catch (err) {
      console.error("[socket] Error joining conversation rooms:", err);
    }

    // ── Event handlers ──────────────────────────────────────────

    socket.on("send_message", async (data) => {
      // Handled in messagingController — we just relay to the room
      const { conversationId, message } = data;
      if (!conversationId || !message) return;
      socket.to(`conversation:${conversationId}`).emit("new_message", {
        message,
        conversationId,
      });
    });

    socket.on("typing_start", ({ conversationId }) => {
      if (!conversationId) return;
      socket.to(`conversation:${conversationId}`).emit("user_typing", {
        conversationId,
        userId,
        username: socket.username,
      });
    });

    socket.on("typing_stop", ({ conversationId }) => {
      if (!conversationId) return;
      socket.to(`conversation:${conversationId}`).emit("user_stopped_typing", {
        conversationId,
        userId,
      });
    });

    socket.on("add_reaction", ({ messageId, emoji }) => {
      // Broadcast to room — actual DB update happens via REST
      // Re-emit with userId so room members can update optimistically
      socket.broadcast.emit("reaction_added", { messageId, emoji, userId });
    });

    socket.on("remove_reaction", ({ messageId, emoji }) => {
      socket.broadcast.emit("reaction_removed", { messageId, emoji, userId });
    });

    socket.on("disconnect", () => {
      console.log(`[socket] User disconnected: ${userId} (${socket.id})`);

      const sockets = userSockets.get(userId);
      if (sockets) {
        sockets.delete(socket.id);
        if (sockets.size === 0) {
          userSockets.delete(userId);
          socket.broadcast.emit("user_offline", { userId });
        }
      }
      socketUsers.delete(socket.id);
      socketRoles.delete(socket.id);
    });
  });

  if (staffRefreshInterval) {
    clearInterval(staffRefreshInterval);
  }
  staffRefreshInterval = setInterval(() => {
    STAFF_ROOMS.forEach((role) => {
      io.to(`role:${role}`).emit("staff:dashboard:refresh", {
        role,
        timestamp: new Date().toISOString(),
        reason: "heartbeat",
      });
    });
  }, 30000);

  console.log("[socket] Socket.IO initialized");
  return io;
}

// ── Utility helpers ──────────────────────────────────────────────

export function getIO() {
  return io;
}

export function getConnectedUsers() {
  return Array.from(userSockets.keys());
}

export function isUserOnline(userId) {
  return userSockets.has(userId) && userSockets.get(userId).size > 0;
}

/** Emit an event to a specific user's all socket connections */
export function emitToUser(userId, event, data) {
  if (!io) return;
  const sockets = userSockets.get(userId?.toString());
  if (!sockets) return;
  sockets.forEach((socketId) => {
    io.to(socketId).emit(event, data);
  });
}

export function emitToRole(role, event, data) {
  if (!io || !role) return;
  io.to(`role:${role}`).emit(event, data);
}

/** Emit an event to all participants in a conversation, optionally excluding one */
export function emitToConversation(conversationId, event, data, excludeUserId = null) {
  if (!io) return;
  const room = `conversation:${conversationId?.toString()}`;
  if (excludeUserId) {
    const sockets = userSockets.get(excludeUserId?.toString());
    if (sockets) {
      sockets.forEach((socketId) => {
        io.to(socketId).emit("message_deleted", { ...data, _hidden: true });
      });
    }
    // Actually just broadcast excluding that socket — simpler:
    socketRoomsExclude(room, excludeUserId, event, data);
  } else {
    io.to(room).emit(event, data);
  }
}

function socketRoomsExclude(room, excludeUserId, event, data) {
  if (!io) return;
  for (const [socketId, userId] of socketUsers.entries()) {
    if (userId === excludeUserId?.toString()) continue;
    io.to(socketId).emit(event, data);
  }
}
