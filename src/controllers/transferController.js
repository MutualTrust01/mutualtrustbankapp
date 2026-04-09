const axios = require("axios");
require("dotenv").config();

const BASE_URL = process.env.CORE_BASE_URL;
const TOKEN = process.env.CORE_API_KEY;
const MFB_CODE = process.env.MFB_CODE;

/* ======================================================
   HELPER FUNCTION
====================================================== */
const handleError = (res, error, label) => {
  console.error(label, error?.response?.data || error.message);

  return res.status(500).json({
    success: false,
    message:
      error.response?.data?.message ||
      error.response?.data ||
      error.message ||
      "An unexpected error occurred.",
  });
};
/* ======================================================
   GET COMMERCIAL BANKS
====================================================== */
module.exports.getBanks = async (req, res) => {
  try {
    const url = `${BASE_URL}/thirdpartyapiservice/apiservice/BillsPayment/GetCommercialBanks/${TOKEN}`;

    const response = await axios.get(url, {
      headers: { Accept: "application/json" },
      timeout: 30000,
    });

    return res.status(response.status).json(response.data);
  } catch (error) {
    return handleError(res, error, "Error fetching commercial banks:");
  }
};

/* ======================================================
   NAME ENQUIRY
====================================================== */
module.exports.nameEnquiry = async (req, res) => {

  const { AccountNumber, BankCode } = req.body;

  try {

    const url = `${BASE_URL}/thirdpartyapiservice/apiservice/Transfer/NameEnquiry`;

    const response = await axios.post(
      url,
      {
        AccountNumber,
        BankCode,
        Token: process.env.CORE_API_KEY
      },
      {
        headers: {
          "Content-Type": "application/json"
        },
        timeout: 30000
      }
    );

    console.log("NAME ENQUIRY RAW RESPONSE:", response.data);

    /* SAVE TO CACHE IF SUCCESSFUL */

  
    return res.status(response.status).json(response.data);

  } catch (error) {

    console.error("Error in Name Enquiry:", error?.response?.data || error.message);

    return res.status(500).json({
      success:false,
      message:
        error.response?.data?.message ||
        error.response?.data ||
        error.message ||
        "An unexpected error occurred."
    });

  }

};
/* ======================================================
   INTERBANK TRANSFER
====================================================== */
module.exports.interBankTransfer = async (req, res) => {
  try {
    const url = `${BASE_URL}/thirdpartyapiservice/apiservice/Transfer/InterBankTransfer`;

    const response = await axios.post(
      url,
      {
        ...req.body,
        Token: TOKEN,
      },
      {
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        timeout: 30000,
      }
    );

    return res.status(response.status).json(response.data);
  } catch (error) {
    return handleError(res, error, "Error in Inter Bank Transfer:");
  }
};

/* ======================================================
   INTERBANK TRANSACTION STATUS
====================================================== */
module.exports.transactionStatusQuery = async (req, res) => {
  const { RetrievalReference, TransactionDate, TransactionType, Amount } =
    req.body;

  try {
    const url = `${BASE_URL}/thirdpartyapiservice/apiservice/Transactions/TransactionStatusQuery`;

    const response = await axios.post(
      url,
      {
        RetrievalReference,
        TransactionDate,
        TransactionType,
        Amount,
        Token: TOKEN,
      },
      {
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        timeout: 30000,
      }
    );

    return res.status(response.status).json(response.data);
  } catch (error) {
    return handleError(res, error, "Error in Transaction Status Query:");
  }
};

/* ======================================================
   LOCAL FUND TRANSFER (INTRA BANK)
====================================================== */
module.exports.localFundTransfer = async (req, res) => {
  try {
    const url = `${BASE_URL}/thirdpartyapiservice/apiservice/CoreTransactions/LocalFundsTransfer`;

    const response = await axios.post(
      url,
      {
        ...req.body,
        Token: TOKEN,
      },
      {
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        timeout: 30000,
      }
    );

    return res.status(response.status).json(response.data);
  } catch (error) {
    return handleError(res, error, "Error in Local Fund Transfer:");
  }
};

/* ======================================================
   CREDIT CUSTOMER ACCOUNT
====================================================== */
module.exports.creditCustomerAccount = async (req, res) => {
  try {
    const url = `${BASE_URL}/thirdpartyapiservice/apiservice/CoreTransactions/Credit`;

    const response = await axios.post(
      url,
      {
        ...req.body,
        Token: TOKEN,
      },
      {
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        timeout: 30000,
      }
    );

    return res.status(response.status).json(response.data);
  } catch (error) {
    return handleError(res, error, "Error in Credit Customer Account:");
  }
};

/* ======================================================
   CORE TRANSACTION STATUS QUERY
   (Credit / Debit / Local)
====================================================== */
module.exports.coreTransactionStatusQuery = async (req, res) => {
  const { RetrievalReference, TransactionDate, TransactionType, Amount } =
    req.body;

  try {
    const url = `${BASE_URL}/thirdpartyapiservice/apiservice/CoreTransactions/TransactionStatusQuery`;

    const response = await axios.post(
      url,
      {
        RetrievalReference,
        TransactionDate,
        TransactionType,
        Amount,
        Token: TOKEN,
      },
      {
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        timeout: 30000,
      }
    );

    return res.status(response.status).json(response.data);
  } catch (error) {
    return handleError(res, error, "Error in Core Transaction Status Query:");
  }
};



/* ======================================================
   REVERSAL (CORE TRANSACTION REVERSAL)
====================================================== */
module.exports.reversal = async (req, res) => {
  const { RetrievalReference, TransactionDate, TransactionType, Amount } =
    req.body;

  try {
    const url = `${process.env.CORE_BASE_URL}/thirdpartyapiservice/apiservice/CoreTransactions/Reversal`;

    const response = await axios.post(
      url,
      {
        RetrievalReference,
        TransactionDate,
        TransactionType,
        Amount,
        Token: process.env.CORE_API_KEY,
      },
      {
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        timeout: 30000,
      }
    );

    return res.status(response.status).json(response.data);
  } catch (error) {
    console.error(
      "Error in Reversal:",
      error?.response?.data || error.message
    );

    return res.status(500).json({
      success: false,
      message:
        error.response?.data?.message ||
        error.response?.data ||
        error.message ||
        "An unexpected error occurred.",
    });
  }
};
