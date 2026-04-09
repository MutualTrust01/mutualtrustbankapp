const coreClient = require("../utils/coreBankingClient");

class TransactionService {

  /* ========================================
     GENERIC CORE CALL WRAPPER
  ======================================== */
  static async callCore(endpoint, payload = {}, method = "POST") {
    try {
      console.log("🚀 CORE CALL:", method, endpoint);

      let response;

      if (method === "GET") {
        response = await coreClient.get(endpoint);
      } else {
        response = await coreClient.post(endpoint, payload);
      }

      return {
        success: true,
        data: response.data
      };

    } catch (error) {
      console.error("❌ CORE FAILURE:", error.response?.data || error.message);

      return {
        success: false,
        message: error.response?.data || error.message
      };
    }
  }

  /* ========================================
     1️⃣ GET COMMERCIAL BANKS
  ======================================== */
  static async getCommercialBanks() {
    const token = process.env.CORE_API_KEY;

    return this.callCore(
      `/ThirdPartyAPIService/APIService/BillsPayment/GetCommercialBanks/${token}`,
      {},
      "GET"
    );
  }

  /* ========================================
     2️⃣ NAME ENQUIRY
  ======================================== */
  static async nameEnquiry(payload) {
    return this.callCore(
      `/thirdpartyapiservice/apiservice/Transfer/NameEnquiry`,
      payload
    );
  }

  /* ========================================
     3️⃣ INTERBANK TRANSFER
  ======================================== */
  static async interbankTransfer(payload) {
    return this.callCore(
      `/thirdpartyapiservice/apiservice/Transfer/InterBankTransfer`,
      payload
    );
  }

  /* ========================================
     4️⃣ INTERBANK STATUS
  ======================================== */
  static async interbankStatus(payload) {
    return this.callCore(
      `/thirdpartyapiservice/apiservice/Transactions/TransactionStatusQuery`,
      payload
    );
  }

  /* ========================================
     5️⃣ LOCAL TRANSFER
  ======================================== */
  static async localTransfer(payload) {
    return this.callCore(
      `/thirdpartyapiservice/apiservice/CoreTransactions/LocalFundsTransfer`,
      payload
    );
  }

  /* ========================================
     6️⃣ CREDIT
  ======================================== */
  static async credit(payload) {
    return this.callCore(
      `/thirdpartyapiservice/apiservice/CoreTransactions/Credit`,
      payload
    );
  }

  /* ========================================
     7️⃣ DEBIT
  ======================================== */
  static async debit(payload) {
    return this.callCore(
      `/thirdpartyapiservice/apiservice/CoreTransactions/Debit`,
      payload
    );
  }

  /* ========================================
     8️⃣ LOCAL STATUS
  ======================================== */
  static async localStatus(payload) {
    return this.callCore(
      `/thirdpartyapiservice/apiservice/CoreTransactions/TransactionStatusQuery`,
      payload
    );
  }

  /* ========================================
     9️⃣ REVERSAL
  ======================================== */
  static async reversal(payload) {
    return this.callCore(
      `/thirdpartyapiservice/apiservice/CoreTransactions/Reversal`,
      payload
    );
  }
}

module.exports = TransactionService;
