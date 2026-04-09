const axios = require("axios");

/* ===============================
   VALIDATE ENV
================================ */
if (!process.env.PAYSTACK_SECRET_KEY) {
  throw new Error("❌ PAYSTACK_SECRET_KEY is missing");
}

if (!process.env.PAYSTACK_BASE_URL) {
  throw new Error("❌ PAYSTACK_BASE_URL is missing");
}

/* ===============================
   NORMALIZE BASE URL
================================ */
const BASE_URL = process.env.PAYSTACK_BASE_URL.replace(/\/+$/, "");

/* ===============================
   AXIOS CLIENT
================================ */
const paystackClient = axios.create({
  baseURL: BASE_URL,
  timeout: 30000,
  headers: {
    Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  },
});

/* ===============================
   STARTUP CONFIRMATION LOG
================================ */
console.log(
  "💳 PAYSTACK READY →",
  BASE_URL,
  "| MODE:",
  process.env.PAYSTACK_SECRET_KEY.startsWith("sk_test")
    ? "TEST"
    : "LIVE"
);

module.exports = paystackClient;
