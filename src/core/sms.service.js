const coreClient = require("../utils/coreBankingClient");
const ENDPOINTS = require("../utils/coreEndpoints");

/* ===============================
   FORMAT PHONE
================================ */
function formatPhone(phone) {

  if (!phone) return phone;

  if (phone.startsWith("0")) {
    return "234" + phone.slice(1);
  }

  return phone;

}

/* ===============================
   SEND BULK SMS
================================ */
async function sendBulkSms(messages = []) {

  if (!Array.isArray(messages) || !messages.length) {
    throw new Error("SMS payload must be a non-empty array");
  }

  const res = await coreClient.post(
    ENDPOINTS.MESSAGING.SEND_BULK_SMS,
    messages
  );

  return res.data;

}

/* ===============================
   SEND SINGLE SMS
================================ */


async function sendSms({ phone, message }) {

  const formattedPhone = formatPhone(phone);

  
const payload = [
  {
    AccountNumber: "02540011000052136",
    To: formattedPhone,
    AccountId: 1,
    Body: message,
    ReferenceNo: "SMS-" + Date.now()
  }
];

  console.log("SMS PAYLOAD:", payload);

  return sendBulkSms(payload);

}

module.exports = {
  sendSms,
  sendBulkSms
};
