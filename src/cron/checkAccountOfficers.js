const https = require("https");
const cron = require("node-cron");
const pool = require("../../db");

/* ================= CONFIG ================= */
const CORE_HOST = "api.mybankone.com";
const CORE_TOKEN = "d5ed1ddd-5cf4-4a8b-8977-2d854bfd07e6";
const BANKONE_MFB_CODE = "0254";

/* ================= REQUEST HELPER ================= */

const fetchJson = (path) => {
  return new Promise((resolve, reject) => {
    const options = {
      method: "GET",
      hostname: CORE_HOST,
      path,
      headers: {
        accept: "application/json",
      },
    };

    const req = https.request(options, (res) => {
      const chunks = [];

      res.on("data", (chunk) => chunks.push(chunk));

      res.on("end", () => {
        const body = Buffer.concat(chunks).toString();

        try {
          resolve(JSON.parse(body));
        } catch (err) {
          reject(new Error(`Invalid JSON response: ${body}`));
        }
      });
    });

    req.on("error", reject);
    req.end();
  });
};

/* ================= HELPERS ================= */

const normalizeName = (str) => {
  return (str || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
};

const normalizePhone = (phone) => {
  let value = String(phone || "").replace(/\D/g, "").trim();

  if (value.startsWith("234") && value.length === 13) {
    value = `0${value.slice(3)}`;
  }

  if (value.length > 11) {
    value = value.slice(-11);
  }

  return value;
};

const extractOfficerArray = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.Message)) return payload.Message;
  if (payload && Array.isArray(payload.message)) return payload.message;
  if (payload && Array.isArray(payload.Data)) return payload.Data;
  if (payload && Array.isArray(payload.data)) return payload.data;
  return [];
};

/* ================= CORE FETCHES ================= */

async function fetchAllAccountOfficers() {
  console.log("\n📥 Fetching all account officers from Core...");

  const path =
    `/BankOneWebAPI/api/AccountOfficer/Get/2` +
    `?authToken=${encodeURIComponent(CORE_TOKEN)}` +
    `&mfbCode=${encodeURIComponent(BANKONE_MFB_CODE)}`;

  console.log("🌐 FETCHING ALL OFFICERS:", path);

  const response = await fetchJson(path);
  console.log("📥 ALL OFFICERS RESPONSE:", JSON.stringify(response));

  const officers = extractOfficerArray(response);

  console.log(`✅ Total officers fetched from Core: ${officers.length}`);
  return officers;
}

async function fetchOfficerByStaffCode(staffCode) {
  const path =
    `/BankOneWebAPI/api/AccountOfficer/GetByStaffCode/2` +
    `?authToken=${encodeURIComponent(CORE_TOKEN)}` +
    `&staffCode=${encodeURIComponent(staffCode)}`;

  console.log("🌐 FETCHING BY STAFF CODE:", staffCode);

  const response = await fetchJson(path);
  console.log("📥 STAFF CODE RESPONSE:", JSON.stringify(response));

  if (!response || response.IsSuccessful !== true || !response.Message) {
    return null;
  }

  return response.Message;
}

/* ================= SYNC ================= */

async function syncAccountOfficers() {
  console.log("\n🔍 Syncing Account Officers from Core...");

  try {
    const basicOfficers = await fetchAllAccountOfficers();

    if (!basicOfficers.length) {
      console.log("❌ No account officers fetched from Core.");
      return;
    }

    let synced = 0;

    for (const row of basicOfficers) {
      try {
        const staffCode = String(row?.Code || "").trim();

        if (!staffCode) {
          console.log("❌ Skipping officer row with no code");
          continue;
        }

        const officer = await fetchOfficerByStaffCode(staffCode);

        if (!officer || !officer.Name || !officer.Code) {
          console.log(`❌ No valid details for ${staffCode}`);
          continue;
        }

        const name = normalizeName(officer.Name);
        const code = String(officer.Code || "").trim();
        const phoneNumber = String(officer.PhoneNumber || "").trim();

        await pool.query(
          `
          INSERT INTO core_account_officers (name, display_code, phone_number, resolved)
          VALUES ($1, $2, $3, false)
          ON CONFLICT (display_code)
          DO UPDATE SET
            name = EXCLUDED.name,
            phone_number = EXCLUDED.phone_number
          `,
          [name, code, phoneNumber]
        );

        synced++;
        console.log(`✅ SYNCED → ${code} | ${name} | ${phoneNumber || "NO PHONE"}`);
      } catch (err) {
        console.log(`❌ SYNC ERROR for ${row?.Code || "UNKNOWN"}:`, err.message);
      }
    }

    console.log(`✅ Core staff sync completed (${synced})`);
  } catch (err) {
    console.error("❌ syncAccountOfficers error:", err.message);
  }
}

/* ================= PHONE MAPPING ================= */

async function mapByPhone() {
  console.log("\n📱 Phone Mapping...");

  try {
    const officers = await pool.query(`
      SELECT id, name, display_code, phone_number
      FROM core_account_officers
      WHERE resolved IS NOT TRUE
        AND phone_number IS NOT NULL
        AND phone_number <> ''
    `);

    const staffList = await pool.query(`
      SELECT id, first_name, last_name, phone_number
      FROM users
      WHERE core_staff_code IS NULL
        AND phone_number IS NOT NULL
        AND phone_number <> ''
    `);

    let matchedCount = 0;

    for (const officer of officers.rows) {
      const officerPhone = normalizePhone(officer.phone_number);

      if (!officerPhone) {
        console.log(`❌ No valid officer phone for: ${officer.name}`);
        continue;
      }

      let matchedStaff = null;

      for (const staff of staffList.rows) {
        const staffPhone = normalizePhone(staff.phone_number);
        if (!staffPhone) continue;

        if (staffPhone === officerPhone) {
          matchedStaff = staff;
          break;
        }
      }

      if (!matchedStaff) {
        console.log(`❌ No phone match for: ${officer.name} (${officer.phone_number})`);
        continue;
      }

      await pool.query(
        `
        UPDATE users
        SET core_staff_code = $1
        WHERE id = $2
        `,
        [officer.display_code, matchedStaff.id]
      );

      await pool.query(
        `
        UPDATE core_account_officers
        SET resolved = true
        WHERE id = $1
        `,
        [officer.id]
      );

      matchedCount++;
      console.log(
        `✅ PHONE MATCHED → ${officer.name} (${officer.phone_number}) → user ${matchedStaff.id}`
      );
    }

    console.log(`🎉 Phone mapping completed (${matchedCount} matched)`);
  } catch (err) {
    console.error("❌ Phone mapping error:", err.message);
  }
}

/* ================= CRONS ================= */

cron.schedule("*/30 * * * *", async () => {
  console.log("\n👤 Cron: Sync Account Officers...");
  await syncAccountOfficers();
});

cron.schedule("*/35 * * * *", async () => {
  console.log("\n📱 Cron: Phone Mapping...");
  await mapByPhone();
});

/* ================= MANUAL TEST ================= */

if (require.main === module) {
  (async () => {
    console.log("\n🚀 Running manual test...\n");

    await syncAccountOfficers();
    await mapByPhone();

    console.log("\n✅ Manual run complete\n");
    process.exit();
  })();
}

module.exports = {
  syncAccountOfficers,
  mapByPhone,
};
