const express = require("express");
const router = express.Router();
const controller = require("../controllers/repayment.controller");

// GET pending repayments
router.get("/pending-repayments", controller.getPendingRepayments);

// POST to core
router.post("/post-repayment/:id", controller.postRepaymentToCore);

module.exports = router;
