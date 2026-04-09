const pool = require("../../db");
const coreBankingClient = require("../utils/coreBankingClient");
const ENDPOINTS = require("../utils/coreEndpoints");

/* =========================
   HELPERS
========================= */
function normalizeName(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isNameMatch(localName, coreName) {
  const cleanLocal = normalizeName(localName);
  const cleanCore = normalizeName(coreName);

  if (cleanLocal === cleanCore) return true;

  const parts = cleanLocal.split(" ");
  return parts.every(p => cleanCore.includes(p));
}

function cleanBase64(data) {
  if (!data) return null;
  return String(data).replace(/^data:image\/\w+;base64,/, "");
}

class StaffAccountService {

  static async getHrmSettings(client) {
    const res = await client.query(`
      SELECT hrm_settings
      FROM system_settings
      LIMIT 1
    `);

    if (!res.rows.length) {
      throw new Error("System settings not found");
    }

    return res.rows[0].hrm_settings || {};
  }

  static async logAudit(client, staffId, action, meta = {}) {
    await client.query(`
      INSERT INTO audit_logs
      (entity_type, entity_id, action, metadata, created_at)
      VALUES ('STAFF', $1, $2, $3, NOW())
    `, [
      staffId,
      action,
      JSON.stringify(meta)
    ]);
  }

  static async createStaffSalaryAccount(staffId) {
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      /* ================= LOAD STAFF ================= */
      const staffRes = await client.query(
        `SELECT * FROM staff_table WHERE id = $1 FOR UPDATE`,
        [staffId]
      );

      if (!staffRes.rows.length) {
        throw new Error("Staff not found");
      }

      const staff = staffRes.rows[0];

      if (!staff.bvn) {
        throw new Error("Staff BVN missing");
      }

      if (staff.salary_account_number) {
        throw new Error("Salary account already exists locally");
      }

      const fullLocalName =
        `${staff.first_name} ${staff.last_name}`;

      /* ================= LOAD SETTINGS ================= */
      const settings = await this.getHrmSettings(client);
      const config = settings?.staffAccountCreation;

      if (!config?.enabled) {
        throw new Error("Staff account creation disabled");
      }

      const productCode = config.productCode;
      const officerCode = config.accountOfficerCode;

      if (!productCode) {
        throw new Error("Salary product not configured");
      }

      /* =====================================================
         1️⃣ CHECK BVN ON CORE FIRST
      ===================================================== */

      let customerId = null;
      let accounts = [];

      try {
        const coreRes = await coreBankingClient.get(
          ENDPOINTS.CUSTOMER.GET_BY_BVN,
          { params: { BVN: staff.bvn } }
        );

        const coreData = coreRes?.data;

        /* DUPLICATE BVN */
        if (
          coreData?.IsSuccessful === false &&
          typeof coreData?.Message === "string" &&
          coreData.Message.toLowerCase().includes("more than one")
        ) {
          throw new Error(
            "Duplicate BVN detected in core. Contact operations."
          );
        }

        /* CUSTOMER FOUND */
        if (
          coreData?.IsSuccessful === true &&
          typeof coreData.Message === "object"
        ) {
          const message = coreData.Message;

          customerId =
            message.CustomerID ||
            message.customerID ||
            null;

          const coreFullName =
            `${message.LastName} ${message.OtherNames}`;

          if (!isNameMatch(fullLocalName, coreFullName)) {
            throw new Error(
              "Core customer name mismatch with staff record"
            );
          }

          /* FETCH ACCOUNTS */
          const accRes = await coreBankingClient.get(
            ENDPOINTS.ACCOUNT.GET_BY_CUSTOMER_ID,
            { params: { CustomerID: customerId } }
          );

          accounts = accRes?.data?.Message || [];
        }

      } catch (err) {
        if (err.message.includes("Duplicate BVN")) {
          throw err;
        }
        // If not found in core, continue to FULL CREATE path
      }

      /* =====================================================
         2️⃣ IF CUSTOMER EXISTS IN CORE
      ===================================================== */

      if (customerId) {

        const existingSalaryAccount = accounts.find(
          acc =>
            String(acc.ProductCode || acc.productCode) ===
            String(productCode)
        );

        /* ❌ SAME PRODUCT → STOP */
        if (existingSalaryAccount) {

          await this.logAudit(client, staffId, "STAFF_SALARY_ACCOUNT_EXISTS", {
            accountNumber: existingSalaryAccount.AccountNumber
          });

          await client.query("ROLLBACK");

          return {
            success: false,
            stopped: true,
            message: "Staff already has salary account in core",
            accountNumber: existingSalaryAccount.AccountNumber
          };
        }

        /* ✅ EXISTS BUT DIFFERENT PRODUCT → QUICK CREATE */
        const quickRes =
          await coreBankingClient.post(
            ENDPOINTS.ACCOUNT.CREATE_ACCOUNT_QUICK,
            {
              CustomerID: String(customerId),
              ProductCode: String(productCode),
              AccountOfficerCode: officerCode
            }
          );

        if (!quickRes?.data?.IsSuccessful) {
          throw new Error(
            quickRes?.data?.Message ||
            "Quick account creation failed"
          );
        }

        const accountNumber =
          quickRes?.data?.Message?.AccountNumber;

        await client.query(`
          UPDATE staff_table
          SET core_customer_id = $2,
              salary_account_number = $3
          WHERE id = $1
        `, [staffId, customerId, accountNumber]);

        await this.logAudit(client, staffId, "STAFF_SALARY_ACCOUNT_CREATED", {
          mode: "QUICK_CREATE",
          accountNumber
        });

        await client.query("COMMIT");

        return {
          success: true,
          newCustomer: false,
          accountNumber
        };
      }

      /* =====================================================
         3️⃣ BVN NOT FOUND → REQUIRE FULL VERIFICATION
      ===================================================== */

      const verificationRes = await client.query(`
        SELECT *
        FROM staff_verifications
        WHERE staff_id = $1
          AND verification_status = 'FULLY_VERIFIED'
          AND identity_locked = TRUE
          AND expires_at > NOW()
        ORDER BY created_at DESC
        LIMIT 1
      `, [staffId]);

      if (!verificationRes.rows.length) {
        throw new Error(
          "BVN not found in core. Staff must complete BVN, NIN and Face verification."
        );
      }

      const verification = verificationRes.rows[0];

      /* FULL CREATE */
      const fullRes =
        await coreBankingClient.post(
          ENDPOINTS.ACCOUNT.CREATE_CUSTOMER_AND_ACCOUNT,
          {
            ProductCode: String(productCode),
            LastName: staff.last_name,
            OtherNames: staff.first_name,
            BVN: staff.bvn,
            PhoneNo: staff.phone_number,
            Email: staff.email,
            NationalIdentityNo: verification.nin,
            Address: staff.address || "Nigeria",
            AccountOfficerCode: officerCode,
            CustomerImage: cleanBase64(verification.customer_photo_base64),
            CustomerSignature: cleanBase64(verification.customer_signature_base64),
          }
        );

      if (!fullRes?.data?.IsSuccessful) {
        throw new Error(
          fullRes?.data?.Message ||
          "Customer creation failed"
        );
      }

      const msg = fullRes.data.Message;

      const newCustomerId =
        msg.CustomerID || msg.customerID;

      const accountNumber =
        msg.AccountNumber;

      await client.query(`
        UPDATE staff_table
        SET core_customer_id = $2,
            salary_account_number = $3
        WHERE id = $1
      `, [
        staffId,
        newCustomerId,
        accountNumber
      ]);

      await this.logAudit(client, staffId, "STAFF_SALARY_ACCOUNT_CREATED", {
        mode: "FULL_CREATE",
        accountNumber
      });

      await client.query("COMMIT");

      return {
        success: true,
        newCustomer: true,
        accountNumber
      };

    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }
}

module.exports = StaffAccountService;
