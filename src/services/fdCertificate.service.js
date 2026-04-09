

const pool = require("../../db");


const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer");
const { getFDCertificateHtml } = require("../templates/fdCertificateTemplate");

const formatDate = (value) => {
  if (!value) return "-";
  const d = new Date(value);
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
};

const formatMoney = (value) => {
  return Number(value || 0);
};

/**
 * CREATE FD CERTIFICATE REQUEST
 * --------------------------------
 * For now:
 * - No settings
 * - No approval matrix
 * - Auto-approve all requests
 * - Extend later
 */
exports.createRequest = async ({
  fdAccount,
  type,
  amount,
  sendMail,
  userId,
}) => {
  // ✅ TEMP: auto approval
  const status = "approved";

  const result = await pool.query(
    `
    INSERT INTO fd_certificate_requests
      (fd_account, request_type, requested_by, amount, status)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *
    `,
    [
      fdAccount,
      type,
      userId,
      amount || 0,
      status,
    ]
  );

  return {
    request: result.rows[0],
    message: "Certificate request created successfully",
  };
};



exports.generateCertificatePdf = async ({
  referenceNo,
  customerName,
  customerAddress,
  productName,
  interestRate,
  principalAmount,
  interestAmount,
  withholdingTax,
  monthlyInterest,
  maturityAmount,
  effectiveDate,
  maturityDate,
  tenorInDays,
  interestRateBasis,
  signatoryOneName,
  signatoryOneTitle,
  signatoryTwoName,
  signatoryTwoTitle,
}) => {
  const outputDir = path.resolve(
    "/home/mutualtrustbankapp/backend/uploads/certificates"
  );

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const safeRef = String(referenceNo || `FD-${Date.now()}`).replace(
    /[^a-zA-Z0-9-_]/g,
    "_"
  );

  const fileName = `${safeRef}.pdf`;
  const outputPath = path.join(outputDir, fileName);

  const html = getFDCertificateHtml({
    referenceNo,
    certificateDate: formatDate(new Date()),
    customerName,
    customerAddress,
    productName,
    interestRate,
    principalAmount: formatMoney(principalAmount),
    interestAmount: formatMoney(interestAmount),
    withholdingTax: formatMoney(withholdingTax),
    monthlyInterest: formatMoney(monthlyInterest),
    maturityAmount: formatMoney(maturityAmount),
    effectiveDate: formatDate(effectiveDate),
    maturityDate: formatDate(maturityDate),
    tenorInDays,
    interestRateBasis: interestRateBasis || "Per Annum",
    signatoryOneName,
    signatoryOneTitle,
    signatoryTwoName,
    signatoryTwoTitle,
  });

  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });

    await page.pdf({
      path: outputPath,
      format: "A4",
      printBackground: true,
      margin: {
        top: "12mm",
        right: "10mm",
        bottom: "12mm",
        left: "10mm",
      },
    });

    return {
      fileName,
      outputPath,
      publicUrl: `/uploads/certificates/${fileName}`,
    };
  } finally {
    await browser.close();
  }
};
