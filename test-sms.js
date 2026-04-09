require("dotenv").config();

const smsService = require("./src/core/sms.service");

async function run() {
  try {

    const res = await smsService.sendSms({
      phone: "08060017221",
      message: "Mutual Trust OTP Test 123456"
    });

    console.log("SMS RESPONSE:", res);

  } catch (err) {

    console.error("SMS ERROR:", err);

  }
}

run();
