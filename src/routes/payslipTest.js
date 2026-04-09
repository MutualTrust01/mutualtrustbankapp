const express = require("express");
const router = express.Router();
const { testPayslipHtml } = require("../controllers/payslipHtmlTest");

router.get("/test-html", testPayslipHtml);

module.exports = router;
