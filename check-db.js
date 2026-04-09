require("dotenv").config(); // 🔥 THIS IS REQUIRED

const { Client } = require("pg");

console.log("DATABASE_URL:", process.env.DATABASE_URL ? "LOADED" : "MISSING");

const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

(async () => {
  await client.connect();

  const db = await client.query(
    "SELECT current_database() AS db, current_schema() AS schema"
  );

  const columns = await client.query(
    "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'users'"
  );

  console.log("\nDATABASE INFO:");
  console.table(db.rows);

  console.log("\nUSERS TABLE COLUMNS:");
  console.table(columns.rows);

  await client.end();
})();
