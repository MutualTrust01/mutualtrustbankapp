const customerLoanService = require("../services/customerLoanService.service");

exports.getCustomerLoans = async (req, res) => {

  try {

    const { customerId } = req.body;

    if (!customerId) {
      return res.status(400).json({
        success: false,
        message: "customerId is required"
      });
    }

    const loans =
      await customerLoanService.getCustomerLoans(customerId);

    return res.json({
      success: true,
      loans
    });

  } catch (err) {

    console.error("Customer loan fetch error:", err.message);

    return res.status(500).json({
      success: false,
      message: err.message
    });

  }

};
