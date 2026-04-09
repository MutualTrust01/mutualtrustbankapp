const CustomerLoanService = require("../services/customerLoanService.service");

exports.requestAccess = async (req, res) => {

  try {

    const { identifier } = req.body;

    if (!identifier) {
      return res.status(400).json({
        success: false,
        message: "BVN or phone number is required"
      });
    }

    const result = await CustomerLoanService.requestAccess(identifier);

    return res.json(result);

  } catch (error) {

    console.error("Customer Loan Service Error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to process request"
    });

  }

};



exports.verifyOTP = async (req, res) => {

  try {

    const { phone, otp } = req.body;

    const result = await CustomerLoanService.verifyOTP(phone, otp);

    return res.json(result);

  } catch (error) {

    console.error("OTP Verification Error:", error);

    return res.status(500).json({
      success:false
    });

  }

};



exports.verifyActivation = async (req, res) => {

  try {

    const { phone, code } = req.body;

    const result = await CustomerLoanService.verifyOTP(phone, code);

    return res.json(result);

  } catch (error) {

    console.error("Activation Verification Error:", error);

    return res.status(500).json({
      success:false
    });

  }

};



exports.resendActivation = async (req, res) => {

  try {

    const { phone } = req.body;

    if (!phone) {
      return res.status(400).json({
        success: false,
        message: "Phone number is required"
      });
    }

    const result = await CustomerLoanService.resendActivation(phone);

    return res.json(result);

  } catch (error) {

    console.error("Resend Activation Error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to resend activation"
    });

  }

};

const LoanService = require("../core/loan.service");


exports.getCustomerLoans = async (req, res) => {
  try {
    const { customerId } = req.body;

    const response = await LoanService.getLoansByCustomerId(customerId);

    res.json({
      success: true,
      loans: response.data?.Message || []
    });

  } catch (error) {
    console.error(error.message);

    res.status(500).json({
      success: false,
      message: "Unable to fetch loans"
    });
  }
};

/*
GET REPAYMENT SCHEDULE
*/
exports.getRepaymentSchedule = async (req, res) => {
  try {
    const { loanAccountNumber } = req.body;

    const response = await LoanService.getRepaymentSchedule(loanAccountNumber);

    res.json({
      success: true,
      schedule: response.data?.Message || []
    });

  } catch (error) {
    console.error(error.message);

    res.status(500).json({
      success: false,
      message: "Unable to fetch repayment schedule"
    });
  }
};

/*
GET LOAN BALANCE
*/
exports.getLoanBalance = async (req, res) => {
  try {

    const { loanAccountNumber } = req.body;

    if (!loanAccountNumber) {
      return res.status(400).json({
        success: false,
        message: "loanAccountNumber is required"
      });
    }

    const response =
  await LoanService.getLoanBalance(
    loanAccountNumber
  );

console.log(
  "BALANCE API RESPONSE:",
  JSON.stringify(response.data, null, 2)
);
    const loan =
      response.data?.Message?.[0] ||
      response.data?.Message ||
      response.data;

    res.json({
      success: true,
      balance: {
        loanAccountNumber: loan?.Number,
        outstandingBalance: loan?.LedgerBalance,
        interestRate: loan?.InterestRate,
        status: loan?.RealLoanStatus
      }
    });

  } catch (error) {

    console.error(
      "Loan balance error:",
      error.message
    );

    res.status(500).json({
      success: false,
      message: "Unable to fetch loan balance"
    });

  }
};
/*
GET LOAN STATEMENT
*/
exports.getLoanStatement = async (req, res) => {
  try {
    const { accountNumber, fromDate, toDate } = req.body;

    const response = await LoanService.getLoanStatement(
      accountNumber,
      fromDate,
      toDate
    );

    res.json({
      success: true,
      statement: response.data?.Message || []
    });

  } catch (error) {
    console.error(error.message);

    res.status(500).json({
      success: false,
      message: "Unable to fetch loan statement"
    });
  }
};
