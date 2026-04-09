require("dotenv").config();
const { Pool } = require("pg");

const isProduction = process.env.NODE_ENV === "production";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isProduction ? { rejectUnauthorized: false } : false,
});

pool.connect()
  .then(() => console.log("Connected to PostgreSQL successfully"))
  .catch((err) => console.error("PostgreSQL connection error:", err));

module.exports = pool;
