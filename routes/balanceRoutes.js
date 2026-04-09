const express = require("express");
const router = express.Router();
const { checkBalance } = require("../src/controllers/balanceController"); 
// 👆 adjust path if needed

router.get("/", checkBalance);  
// now GET /api/balance will work

module.exports = router;
