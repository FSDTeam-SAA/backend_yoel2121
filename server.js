import "dotenv/config";
import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import cookieParser from "cookie-parser";
import router from "./mainroute/index.js";
import { createServer } from "http";
import { Server } from "socket.io";

import globalErrorHandler from "./middleware/globalErrorHandler.js";
import notFound from "./middleware/notFound.js";
import { initFirebase } from "./utils/firebase.js";
import { setIo } from "./utils/socket.js";

initFirebase();

const app = express();

app.set("trust proxy", true);

const normalizeOrigin = (origin = "") => origin.trim().replace(/\/+$/, "");

const staticAllowedOrigins = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://10.10.5.81:5006",
  "http://localhost:8000",
  "http://127.0.0.1:8000",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
  "https://admin-dashbord-yoel2121.vercel.app",
  "https://admin-dashboard-yoel2121.vercel.app",
  "https://pr7m9mtd-5174.asse.devtunnels.ms",
  "https://zentrofix.com",
  "https://www.zentrofix.com",
  "https://admin.zentrofix.com",
];

const envAllowedOrigins = (process.env.CLIENT_URL || "")
  .split(",")
  .map((origin) => normalizeOrigin(origin))
  .filter(Boolean);

const allowedOrigins = [
  ...new Set([...staticAllowedOrigins, ...envAllowedOrigins]),
].map((origin) => normalizeOrigin(origin));

const allowedOriginPatterns = [
  /^https:\/\/admin-dashbord-yoel2121(?:-[a-z0-9-]+)?\.vercel\.app$/i,
  /^https:\/\/admin-dashboard-yoel2121(?:-[a-z0-9-]+)?\.vercel\.app$/i,
  /^http:\/\/localhost:\d+$/i,
  /^http:\/\/127\.0\.0\.1:\d+$/i,
];

const isAllowedOrigin = (origin) => {
  const normalized = normalizeOrigin(origin);
  return (
    allowedOrigins.includes(normalized) ||
    allowedOriginPatterns.some((pattern) => pattern.test(normalized))
  );
};

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (isAllowedOrigin(origin)) return callback(null, true);
    return callback(new Error("Not allowed by CORS: " + origin));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

app.use(cors(corsOptions));

// ✅ FIX: use regex instead of "*"
app.options(/.*/, cors(corsOptions));

const server = createServer(app);

export const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: true,
  },
});
setIo(io);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use("/public", express.static("public"));

app.use("/api/v1", router);

app.get("/", (req, res) => {
  res.send("Server is running...!!");
});

app.use(notFound);
app.use(globalErrorHandler);

io.on("connection", (socket) => {
  console.log("A client connected:", socket.id);

  socket.on("joinChatRoom", (userId) => {
    if (userId) {
      socket.join(`chat_${userId}`);
      socket.join(`user_${userId}`);
      console.log(`Client ${socket.id} joined user room: ${userId}`);
    }
  });

  socket.on("joinNotificationRoom", (userId) => {
    if (userId) {
      socket.join(`user_${userId}`);
      console.log(`Client ${socket.id} joined notification room: ${userId}`);
    }
  });

  socket.on("joinConversation", (conversationId) => {
    if (conversationId) {
      socket.join(`conv_${conversationId}`);
      console.log(`Client ${socket.id} joined conversation: ${conversationId}`);
    }
  });

  socket.on("joinAlerts", () => {
    socket.join("alerts");
    console.log(`Client ${socket.id} joined alerts room`);
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
  });
});

const PORT = process.env.PORT || 5000;

server.listen(PORT, async () => {
  console.log(`Server is running on port ${PORT}`);

  try {
    await mongoose.connect(process.env.MONGO_DB_URL);
    console.log("MongoDB connected");
  } catch (err) {
    console.error("MongoDB connection error:", err);
    process.exit(1);
  }
});
