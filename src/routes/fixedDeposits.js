const express = require("express");
const router = express.Router();

const fixedDepositController = require("../controllers/fixedDepositController");

router.post("/request", fixedDepositController.createFDRequest);
router.get("/requests", fixedDepositController.getFDRequests);
router.post("/book", fixedDepositController.createFixedDeposit);
router.post("/requests/:id/book", fixedDepositController.markFDRequestAsBooked);

router.get(
  "/by-liquidation-account/:accountNumber",
  fixedDepositController.getByLiquidationAccount
);

module.exports = router;
