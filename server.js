
const path = require("path");
const { getAIResponse } = require("./src/services/aiChatService");
require("dotenv").config({
  path: path.resolve(__dirname, ".env"),
});
console.log("TEST RESTART");
const ENV = process.env.NODE_ENV || "development";


/**
 * Production only (localhost must NOT be treated as prod)
 */
const isProd = ENV === "production";



const express = require("express");
const http = require("http");
const cors = require("cors");
const session = require("express-session");
const jwt = require("jsonwebtoken");
const { Server } = require("socket.io");
const pool = require("./db");

const pgSession = require("connect-pg-simple")(session);


const auth = require("./middleware/auth");


/* ================= ROUTERS ================= */
const authRouter = require("./routes/auth.js");
const logsRouter = require("./src/routes/logs");

const usersRouter = require("./src/routes/users");
const rolesRouter = require("./routes/roles");
const adminRouter = require("./routes/admin");
const pendingApprovalsRouter = require("./routes/pendingapprovals");
const settingsRouter = require("./routes/settings");
const accountRouter = require("./routes/openAccountRoutes");
const balanceRouter = require("./routes/balanceRoutes");
const customerRouter = require("./src/routes/customer"); // ✅ ADMIN CUSTOMERS
const transactionRouter = require("./src/routes/transactions");
const auditRoutes = require("./routes/audit");
const coreRouter = require("./src/routes/core");
const chatRouter = require("./routes/chat"); // ✅ LIVE CHAT
const complaintsRouter = require("./src/routes/complaints");

const internalCoreRouter = require("./src/routes/internalCore");

const staffOnboardingRoutes = require("./src/routes/staffOnboardingRoutes");

const loanApprovalRoutes = require("./src/routes/loanApprovals");

const transferRoutes = require('./src/routes/transferRoutes'); // Ensure this path is correct

const staffAccessRoutes = require("./src/routes/staffAccess.routes");

const repaymentRoutes = require("./src/routes/repayment.routes");
const notificationRoutes = require("./src/routes/notification.routes");


const loanRoutes = require("./src/routes/loan.routes");

const customerLoanServiceRoutes = require("./routes/customerLoanService");
const payslipRouter = require("./src/routes/payslipRoutes");

const hrmRoutes = require("./src/routes/hrm.routes");
console.log("📌 payslipRouter =", payslipRouter);



const customerAuthRouter = require("./src/routes/customerAuth").default;






const app = express();
app.set("etag", false);
const server = http.createServer(app);


const webpush = require("web-push");

webpush.setVapidDetails(
  "mailto:pelumi.olatunji@mutualtrustmfbank.com",
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);


app.set("webpush", webpush);

console.log("✅ Webpush configured");

app.set("trust proxy", 1);

/* ================= MIDDLEWARE ================= */

/* ================= PAYSTACK WEBHOOK (RAW BODY) ================= */



/* 1️⃣ BODY PARSER */
app.use(express.json({ limit: "200mb" }));
app.use(express.urlencoded({ extended: true, limit: "200mb" }));

app.use("/api", require("./src/routes/push.routes"));







app.use(
  "/uploads",
  express.static(path.join(__dirname, "uploads"))
);


// ✅ PUBLIC ASSETS (EMAIL IMAGES, ETC.)
app.use(
  "/public",
  express.static(path.join(__dirname, "public"))
);

app.get("/service-worker.js", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "service-worker.js"));
});


const httpOrigins = {
  development: [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://ibank.mutualtrustmfbank.com",
    "https://mutualtrustmfbank.com",
  ],
  staging: [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://ibank.mutualtrustmfbank.com",
    "https://mutualtrustmfbank.com",
  ],
  production: [
    "https://ibank.mutualtrustmfbank.com",
    "https://mutualtrustmfbank.com",
  ],
};


const corsOptions = {
  origin: (origin, cb) => {
    const allowed = httpOrigins[ENV] || [];

    if (!origin) {
      return cb(null, true);
    }

    if (allowed.includes(origin)) {
      return cb(null, true);
    }

    console.error("❌ CORS blocked origin:", origin, "| ENV:", ENV);
    return cb(new Error("CORS blocked"));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "x-core-key"],
};

app.use(cors(corsOptions));

// 🔥 VERY IMPORTANT — ENABLE PREFLIGHT
app.options("*", cors(corsOptions));

/* 3️⃣ SESSION (SYNC — REQUIRED) */
/* 3️⃣ SESSION (SYNC — REQUIRED) */
const sessionMiddleware = session({
  store: new pgSession({
    pool,
    tableName: "user_sessions",
  }),
  name: "mfb.sid",
  secret: process.env.SESSION_SECRET || "super_secret_key",
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
  httpOnly: true,
  secure: true,        // keep true (HTTPS)
  sameSite: "none",     // 🔥 change from "none" to "lax"
  maxAge: 15 * 60 * 1000,
  path: "/",
},
});

app.use(sessionMiddleware);


/* ================= PAYSLIP (PUBLIC JSON) ================= */
app.use("/api/payslip", payslipRouter);




// 🔥 THIS FIXES THE ERROR YOU SAW
app.use((req, res, next) => {
  req.db = pool;
  next();
});

app.use(
  "/api/paystack-wallet",
  require("./src/routes/paystackWallet.routes")
);


app.use("/payslip", require("./src/routes/payslipTest"));




// ADMIN / STAFF
app.use("/api/auth", authRouter);

// CUSTOMER (Mobile + Internet Banking)
app.use("/api/customer/auth", customerAuthRouter);


/* 🔄 LOAD SESSION TIMEOUT FROM system_settings */
/* 🔄 LOAD SESSION TIMEOUT FROM system_settings */
app.use(async (req, res, next) => {

  // 🔓 ALLOW PAYSLIP ROUTES (NO SESSION TOUCH)
 if (req.originalUrl.startsWith("/api/payslip")) {
    return next();
  }

  try {
    const r = await pool.query(`
      SELECT session_config
      FROM system_settings
      ORDER BY updated_at DESC
      LIMIT 1
    `);

    const sessionConfig = r.rows[0]?.session_config;

    // ✅ Only update cookie if session exists
    if (sessionConfig?.adminTimeout && req.session) {
      req.session.cookie.maxAge =
        sessionConfig.adminTimeout * 60 * 1000;
    }
  } catch (err) {
    console.error("Session timeout load failed:", err.message);
  }

  next();
});


/* ================= Account Officer ================= */

app.use(
  "/api/account-officers",
  require("./routes/accountOfficers")
);

app.use("/api/sms", require("./routes/sms"));
app.use("/api/internal/sms", require("./routes/internalSms"));

// 🔐 CORE TESTING ROUTE (Postman)

app.use("/api/products", require("./routes/products"));
app.use("/api/fixed-deposit", require("./routes/fixedDeposit"));

app.use("/api/fixed-deposits", require("./src/routes/fixedDeposits"));

/* ================= BASIC ROUTE ================= */
app.get("/", (req, res) => {
  res.send("Backend is running ✅");
});



/* ================= TEST SESSION ================= */
app.get("/api/test-session", (req, res) => {
  req.session.views = (req.session.views || 0) + 1;
  res.json({
    views: req.session.views,
    sessionID: req.sessionID,
  });
});

/* ================= API ROUTES ================= */



// ✅ STAFF ONBOARDING
app.use("/api/staff-onboarding", staffOnboardingRoutes);


app.use("/api/youverify", require("./src/routes/youverify.routes"));

app.use("/webhooks", require("./src/routes/youverify.webhook"));


app.use(
  "/api/operations/account-officer",
  require("./src/routes/operationsAccountOfficer.routes")
);

/* ================= PUBLIC ROUTES ================= */
app.use(
  "/api/loans/public",
  require("./src/routes/publicRelationshipManager.routes")
);
app.use("/api/loans", loanRoutes);

app.use("/api/customer-loan-service", customerLoanServiceRoutes);



app.use("/api/banks", require("./src/routes/banks"));



app.use("/manifest.json", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "manifest.json"));
});

app.use("/api/bank", require("./src/routes/bankVerification"));
app.use("/api/transfer", transferRoutes); 


app.use(
  "/api/paystack",
  require("./src/routes/paystackDirectDebit.routes")
);



/* ================= PROTECT EVERYTHING BELOW ================= */
app.use("/api/repayments", repaymentRoutes);



app.use(auth);


/* ================= NOTIFICATIONS ================= */
app.use("/api/notifications", notificationRoutes);


app.use("/api/loan-approvals", loanApprovalRoutes);

/* ADMIN */
app.use("/api/customers", customerRouter); // ✅ FIXED
app.use("/api/admin", adminRouter);

app.use(
  "/api/admin/repayments",
  require("./src/routes/repayment.routes")
);

/* CORE SYSTEM */
app.use("/api/users", usersRouter);
app.use("/api/profile", require("./src/routes/profile.routes"));
app.use("/api/roles", rolesRouter);
app.use("/api/settings", settingsRouter);
app.use("/api/pending-approvals", pendingApprovalsRouter);
app.use("/api/onboard", accountRouter);
app.use("/api/balance", balanceRouter);
app.use("/api/balance", transactionRouter);

/* product by code is here*/
app.use("/api/core", coreRouter);
/* COMPLAINTS */
app.use("/api/complaints", complaintsRouter);

app.use("/api/internal/core", internalCoreRouter);

app.use("/api/accounts", require("./src/routes/account"));


app.use("/api/signature", require("./src/routes/signature.routes"));











/* LIVE CHAT (ISOLATED) */
app.use("/api/chat", chatRouter);
app.use("/api/admin/chat", require("./routes/adminAssignChat"));
/* LOGS & AUDIT */
app.use("/api/logs", logsRouter);
app.use("/audit", auditRoutes);

app.use("/api/hrm", hrmRoutes);
app.use("/api/staff-access", staffAccessRoutes);
/* ================= CRON JOBS ================= */
const cron = require("node-cron");
const { syncAccountTransactions } = require("./src/controllers/transactionController");
const { logEvent } = require("./src/utils/logger");

const { runLoanRepayments } = require("./src/cron/loanRepaymentCron");

require("./src/cron/checkAccountOfficers");

if (process.env.RUN_CRON === "true") {

  // 💳 LOAN REPAYMENT CRON (DAILY)
  cron.schedule("*/2 * * * *", async () => {
    try {
      console.log("💳 Cron: running loan repayments...");
      await runLoanRepayments();
      console.log("✅ Loan repayment cron completed");
    } catch (err) {
      console.error("❌ Loan repayment cron failed:", err.message);
    }
  });




  // 🔁 TRANSACTION SYNC
  cron.schedule("*/20 * * * *", async () => {
    console.log("⏳ Cron: syncing transactions");
    await logEvent("CRON_RUN", "Transaction sync started");

    try {
      const accounts = await pool.query(
        "SELECT account_number FROM accounts WHERE status='active'"
      );

      for (const row of accounts.rows) {
        await syncAccountTransactions(row.account_number);
      }

      await logEvent("SYNC_COMPLETE", "Transaction sync finished");
      console.log("✔ Transaction sync completed");
    } catch (err) {
      await logEvent("SYNC_ERROR", err.message, "failed");
      console.error("❌ Transaction sync failed:", err.message);
    }
  });

  
} else {
  console.log("⏸ Cron disabled on this instance");
}



/* ================= SOCKET.IO ================= */
/* ================= SOCKET.IO ================= */

const socketOrigins = {
  development: [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://ibank.mutualtrustmfbank.com",
    "https://mutualtrustmfbank.com",
  ],
  staging: [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://ibank.mutualtrustmfbank.com",
    "https://mutualtrustmfbank.com",
  ],
  production: [
    "https://ibank.mutualtrustmfbank.com",
    "https://mutualtrustmfbank.com",
  ],
};

const io = new Server(server, {
  cors: {
    origin: socketOrigins[ENV],
    credentials: true,
  },
});



const chatIO = io.of("/chat");

/* ================= NOTIFICATIONS SOCKET ================= */
const notificationIO = io.of("/notifications");   // 👈 MUST COME FIRST


app.set("io", io);

notificationIO.use((socket, next) => {

  // 🔥 Manually run Express session middleware
  sessionMiddleware(socket.request, {}, () => {

    const session = socket.request.session;

    console.log("SESSION FROM SOCKET:", session);

if (!session || !session.user) {
  console.log("⚠️ No session or user — allowing connection");
  socket.user = null; // allow but no user
  return next();      // ✅ DO NOT BLOCK
}

    console.log("✅ Session user:", session.user);

    socket.user = session.user;
    next();
  });

});

notificationIO.on("connection", (socket) => {
  console.log("🔔 Notification socket connected:", socket.user);

  socket.on("disconnect", () => {
    console.log("🔕 Notification socket disconnected:", socket.user?.id);
  });
});

chatIO.use((socket, next) => {
  const token = socket.handshake.auth?.token;

  // CUSTOMER (NO TOKEN)
  if (!token) {
    socket.user = { role: "customer", id: socket.id };
    return next();
  }

  // ADMIN / STAFF
  try {
    socket.user = jwt.verify(token, process.env.JWT_SECRET);
    return next();
  } catch {
    return next(new Error("Invalid token"));
  }
});

chatIO.on("connection", (socket) => {
  console.log("🟢 Chat connected:", socket.user);

  /* JOIN ROOM */
  socket.on("join_room", (roomId) => {
    if (!roomId?.startsWith("chat:")) return;
    socket.join(roomId);
  });

  /* SEND MESSAGE */
  socket.on("send_message", async ({ roomId, sender, message }, callback) => {
    if (!roomId || !message) return;

    const finalSender =
      sender || (socket.user.role === "admin" ? "ADMIN" : "CUSTOMER");

    try {
      const result = await pool.query(
        `
        INSERT INTO chat_messages
        (room_id, sender, message, read, delivered, delivered_at)
        VALUES ($1, $2, $3, $4, true, NOW())
        RETURNING id, created_at
        `,
        [roomId, finalSender, message, finalSender === "ADMIN"]
      );

      const savedMessage = {
        id: result.rows[0].id,
        roomId,
        sender: finalSender,
        message,
        created_at: result.rows[0].created_at,
        delivered: true,
      };

      // 🔔 Broadcast to room
      chatIO.to(roomId).emit("receive_message", savedMessage);
      socket.emit("receive_message", savedMessage);

/* 🤖 AI AUTO RESPONSE BEFORE ADMIN */
/* 🤖 AI AUTO RESPONSE + ESCALATION */

if (finalSender === "CUSTOMER") {
  try {

    const text = message.toLowerCase();

    const escalateKeywords = [
      "agent",
      "human",
      "staff",
      "loan officer",
      "complaint",
      "speak to someone",
      "manager"
    ];

    const needsAdmin = escalateKeywords.some(k => text.includes(k));

    if (needsAdmin) {

      const aiResult = await pool.query(
  `
  INSERT INTO chat_messages
  (room_id, sender, message, read, delivered, delivered_at)
  VALUES ($1, $2, $3, false, true, NOW())
  RETURNING id, created_at
  `,
  [roomId, "AI", aiReply]
);

const aiMessage = {
  id: aiResult.rows[0].id,
  roomId,
  sender: "AI",
  message: aiReply,
  created_at: aiResult.rows[0].created_at,
  delivered: true,
};

chatIO.to(roomId).emit("receive_message", aiMessage);
      // 🔔 Notify admins
      chatIO.emit("admin_notification", {
        roomId,
        message
      });

    } else {

      const aiReply = await getAIResponse(message);

      const aiMessage = {
        id: Date.now(),
        roomId,
        sender: "AI",
        message: aiReply,
        created_at: new Date(),
        delivered: true,
      };

      chatIO.to(roomId).emit("receive_message", aiMessage);

    }

  } catch (err) {
    console.error("AI response failed:", err.message);
  }
}

      // ✅ ACK sender
      callback?.({ success: true, message: savedMessage });

    } catch (err) {
      console.error("❌ Chat message save failed:", err.message);
      callback?.({ success: false });
    }
  });

  /* TYPING INDICATOR */
  socket.on("typing", ({ roomId, sender }) => {
    if (!roomId) return;
    socket.to(roomId).emit("typing", { roomId, sender });
  });

  socket.on("stop_typing", ({ roomId, sender }) => {
    if (!roomId) return;
    socket.to(roomId).emit("stop_typing", { roomId, sender });
  });

  /* DISCONNECT */
  socket.on("disconnect", () => {
    console.log("🔴 Chat disconnected:", socket.user?.id);

    if (socket.user?.role === "admin") {
      chatIO.emit("admin_status", { status: "OFFLINE" });
    }
  });

  /* ADMIN ONLINE STATUS */
  if (socket.user?.role === "admin") {
    chatIO.emit("admin_status", { status: "ONLINE" });
  }
});


const multer = require("multer");

/* ================= GLOBAL ERROR HANDLER ================= */
app.use((err, req, res, next) => {
  console.error("GLOBAL ERROR:", err);

  // Multer errors (file upload)
  if (err instanceof multer.MulterError) {
    return res.status(400).json({
      message: err.message,
    });
  }

  // Custom errors
  if (err.message) {
    return res.status(400).json({
      message: err.message,
    });
  }

  // Fallback
  res.status(500).json({
    message: "Internal server error",
  });
});




/* ================= START SERVER ================= */
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
