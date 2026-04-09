const path = require("path");

function money(value) {
  return `₦${Number(value || 0).toLocaleString("en-NG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function getFDCertificateHtml(data) {
  const logoPath = `file://${path.resolve("/home/mutualtrustbankapp/backend/public/certificates/logo.png")}`;

  return `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8" />
    <style>
      body {
        font-family: Arial, Helvetica, sans-serif;
        color: #111827;
        padding: 38px 42px;
        font-size: 13.5px;
        line-height: 1.45;
      }

      .top {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 18px;
      }

      .logo {
        width: 220px;
        object-fit: contain;
      }

      .bank-meta {
        text-align: right;
        font-size: 12px;
        line-height: 1.6;
      }

      .ref-row {
        margin-top: 18px;
        margin-bottom: 20px;
        font-size: 13px;
      }

      .customer-block {
        margin-bottom: 22px;
      }

      .title {
        text-align: center;
        font-weight: 700;
        text-transform: uppercase;
        text-decoration: underline;
        margin: 18px 0 18px;
        font-size: 16px;
      }

      .intro {
        margin-bottom: 16px;
      }

      table.details {
        width: 100%;
        border-collapse: collapse;
        margin-top: 8px;
        margin-bottom: 18px;
      }

      table.details td {
        padding: 7px 4px;
        vertical-align: top;
      }

      table.details td.label {
        width: 45%;
        font-weight: 700;
      }

      .terms {
        margin-top: 12px;
      }

      .terms ol {
        margin: 8px 0 0 18px;
        padding: 0;
      }

      .terms li {
        margin-bottom: 7px;
      }

      .closing {
        margin-top: 22px;
      }

      .signatures {
        margin-top: 38px;
        display: flex;
        justify-content: space-between;
        gap: 30px;
      }

      .signature-box {
        width: 45%;
      }

      .sig-line {
        margin-top: 40px;
        border-top: 1px solid #111827;
        width: 100%;
        padding-top: 6px;
        font-weight: 700;
      }

      .sig-title {
        font-weight: 400;
        font-size: 12px;
        margin-top: 2px;
      }
    </style>
  </head>
  <body>
    <div class="top">
      <div>
        <img src="${logoPath}" class="logo" />
      </div>

      <div class="bank-meta">
        797 Adetokunbo Ademola Crescent, Wuse 2, Abuja<br/>
        +234 909 544 4887, +234 909 544 4886<br/>
        mails@mutualtrustmfb.com<br/>
        www.mutualtrustmfb.com
      </div>
    </div>

    <div class="ref-row">
      <strong>Ref No:</strong> ${data.referenceNo || "-"}<br/>
      ${data.certificateDate || "-"}
    </div>

    <div class="customer-block">
      <strong>${data.customerName || "-"}</strong><br/>
      ${data.customerAddress || ""}
    </div>

    <div class="title">Fixed Deposit Confirmation Certificate</div>

    <div class="intro">
      We confirm your Fixed Deposit Investment with us under the following terms and conditions:
    </div>

    <table class="details">
      <tr><td class="label">Product Name:</td><td>${data.productName || "-"}</td></tr>
      <tr><td class="label">Interest Rate per annum (%):</td><td>${data.interestRate ?? "-"}</td></tr>
      <tr><td class="label">Fixed Deposit Amount:</td><td>${money(data.principalAmount)}</td></tr>
      <tr><td class="label">Interest Amount:</td><td>${money(data.interestAmount)}</td></tr>
      <tr><td class="label">Withholding Tax:</td><td>${money(data.withholdingTax)}</td></tr>
      <tr><td class="label">Monthly Interest:</td><td>${money(data.monthlyInterest)}</td></tr>
      <tr><td class="label">Amount Payable at Maturity:</td><td>${money(data.maturityAmount)}</td></tr>
      <tr><td class="label">Effective Date:</td><td>${data.effectiveDate || "-"}</td></tr>
      <tr><td class="label">Maturity Date:</td><td>${data.maturityDate || "-"}</td></tr>
      <tr><td class="label">Tenor (in days):</td><td>${data.tenorInDays || "-"}</td></tr>
      <tr><td class="label">Interest Rate Basis:</td><td>${data.interestRateBasis || "Per Annum"}</td></tr>
    </table>

    <div class="terms">
      We hereby confirm that:
      <ol>
        <li>Maturity value is subject to withholding tax of 10% of accrued interest.</li>
        <li>In the absence of any maturity instruction, the Bank may act based on the product configuration and prevailing terms.</li>
        <li>Premature liquidation may affect accrued interest entitlement.</li>
        <li>Please notify the Bank of any discrepancy immediately upon receipt of this certificate.</li>
        <li>This certificate is generated based on the booked fixed deposit details in the Bank's records.</li>
      </ol>
    </div>

    <div class="closing">
      Yours faithfully,<br/>
      <strong>Mutual Trust Microfinance Bank Limited</strong>
    </div>

    <div class="signatures">
      <div class="signature-box">
        <div class="sig-line">${data.signatoryOneName || ""}</div>
        <div class="sig-title">${data.signatoryOneTitle || ""}</div>
      </div>

      <div class="signature-box">
        <div class="sig-line">${data.signatoryTwoName || ""}</div>
        <div class="sig-title">${data.signatoryTwoTitle || ""}</div>
      </div>
    </div>
  </body>
  </html>
  `;
}

module.exports = { getFDCertificateHtml };
