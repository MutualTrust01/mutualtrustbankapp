const express = require("express");
const router = express.Router();

const {
  addClient,
  removeClient,
} = require("../utils/payslipProgress");

/**
 * SSE endpoint for payslip upload progress
 */
router.get("/payslip/progress/:uploadId", (req, res) => {
  const { uploadId } = req.params;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  res.flushHeaders();

  addClient(uploadId, res);

  req.on("close", () => {
    removeClient(uploadId);
  });
});

module.exports = router;
