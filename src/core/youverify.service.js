const axios = require("axios");

const YOUVERIFY_BASE_URL = process.env.YOUVERIFY_BASE_URL;
const YOUVERIFY_API_KEY = process.env.YOUVERIFY_API_KEY;

class YouVerifyService {
  static async verifyBvnFacial(payload) {
    return axios.post(
      `${YOUVERIFY_BASE_URL}/v2/api/identity/ng/bvn`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${YOUVERIFY_API_KEY}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        timeout: 30000,
      }
    );
  }
}

module.exports = YouVerifyService;
