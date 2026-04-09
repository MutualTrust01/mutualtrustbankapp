const React = require("react");

const naira = (v) => {
  if (isNaN(Number(v))) return "-";
  return `₦${Number(v).toLocaleString("en-NG", {
    minimumFractionDigits: 2,
  })}`;
};

const formatDate = (v) => {
  const d = new Date(v);
  return isNaN(d.getTime())
    ? "-"
    : d.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
};

function PayslipTemplate({ p, ippis }) {
  return React.createElement(
    "html",
    null,
    React.createElement(
      "head",
      null,
      React.createElement("meta", { charSet: "utf-8" }),
      React.createElement(
        "style",
        null,
        `
        body {
          font-family: Helvetica, "Helvetica Neue", Arial, sans-serif;
          font-size: 9px;
          margin: 36px 42px;
          color: #000;
          line-height: 1.25;
        }

        .center { text-align: center; }

        h1 {
          font-size: 12px;
          margin: 4px 0 2px;
          font-weight: bold;
        }

        .header-block {
  margin-bottom: 14px;
}

/* Employee details spacing */
.employee-details {
  margin-top: 10px;        /* space from header */
  margin-bottom: 12px;     /* space before bank info */
}

/* Increase row spacing slightly */
.employee-details td {
  padding-top: 3px;
  padding-bottom: 3px;
}

/* Create left/right column gutter */
.employee-details td:nth-child(1),
.employee-details td:nth-child(3) {
  padding-right: 14px;
}

/* Optional: keep values from touching labels */
.employee-details td span.label {
  margin-right: 4px;
}


        h2 {
          font-size: 11px;
          margin: 0;
          font-weight: normal;
        }

        h3 {
          font-size: 9.5px;
          margin: 3px 0;
          font-weight: normal;
        }

        table {
          width: 100%;
          border-collapse: collapse;
        }

        td {
          padding: 2px 3px;
          vertical-align: top;
        }

        .label {
          font-weight: bold;
          white-space: nowrap;
        }

        .section-title {
          font-weight: bold;
          font-size: 9px;
          border-bottom: 1px solid #000;
          padding-bottom: 2px;
          margin-top: 10px;
          margin-bottom: 4px;
        }

        .thin-line {
          border-bottom: 1px solid #000;
          margin: 6px 0;
        }

        .amount {
          text-align: right;
          white-space: nowrap;
        }

        .watermark {
          position: fixed;
          top: 46%;
          left: 22%;
          font-size: 44px;
          opacity: 0.12;
          transform: rotate(-35deg);
          pointer-events: none;
        }
          /* Earnings / Deductions table headers */
.table-header td {
  font-weight: bold;
  padding-bottom: 4px;
}

/* Keep amount header aligned like IPPIS */
.table-header .amount {
  font-weight: bold;
}


        .logo {
          width: 36px;
          margin-bottom: 4px;
        }

        .footer {
          margin-top: 24px;
          font-size: 8px;
        }
      `
      )
    ),

    React.createElement(
      "body",
      null,

      /* WATERMARK */
      React.createElement("div", { className: "watermark" }, "MUTUAL TRUST MFB LOAN PLATFORM"),

      /* HEADER */
React.createElement("div", { className: "center header-block" },
  React.createElement("img", {
    src: "http://localhost:5000/public/gov_logo.png",
    className: "logo"
  }),
  React.createElement("h1", null, "FEDERAL GOVERNMENT OF NIGERIA"),
  React.createElement("h2", null, "NIGERIAN SECURITY AND CIVIL DEFENCE CORPS"),
  React.createElement("h3", null, "EMPLOYEE PAYSLIP"),
  React.createElement("h3", null, p.pay_month || "JUNE 2025")
),

/* EMPLOYEE DETAILS */
React.createElement(
  "table",
  { className: "employee-details" },
  detailRow("Employee Name", p.full_name, "Grade", p.grade),
  detailRow("IPPIS Number", ippis, "Step", p.grade_step),
  detailRow("Legacy ID", p.legacy_id, "Gender", p.gender),
  detailRow("MDA/School/Command", p.ministry, "Tax State", p.tax_state),
  detailRow("Department", p.department, "Date of Appointment", formatDate(p.hire_date)),
  detailRow("Location", p.location, "Date of Birth", formatDate(p.date_of_birth)),
  detailRow("Job", p.job_title),
  detailRow("Union Name", p.union_name)
),


      /* BANK INFO */
      React.createElement("div", { className: "section-title" }, "Bank Information Details"),
      React.createElement("table", null,
        detailRow("Bank Name", p.bank_name, "PFA Name", p.pfa_admins),
        detailRow("Account Number", p.account_number, "Pension PIN", p.pin_no)
      ),

      React.createElement("div", { className: "thin-line" }),

      /* EARNINGS | DEDUCTIONS + SUMMARY */
      React.createElement("table", null,
        React.createElement("tr", null,

          /* LEFT — EARNINGS */
          React.createElement("td", { style: { width: "50%" } },
            React.createElement("div", { className: "section-title" }, "Gross Earnings Information"),
            React.createElement("table", null,
              headerRow("Earnings", "Amount"),
              ...rowsByPrefix(p, "1")
            )
          ),

          /* RIGHT — DEDUCTIONS + SUMMARY */
          React.createElement("td", { style: { width: "50%" } },
            React.createElement("div", { className: "section-title" }, "Gross Deduction Information"),
            React.createElement("table", null,
              headerRow("Deductions", "Amount"),
              ...rowsByPrefix(p, ["3", "4"])
            ),

            React.createElement("div", { className: "thin-line" }),

            React.createElement("div", { className: "section-title" }, "Summary of Payments"),
            React.createElement("table", null,
              summaryRow("Total Gross Earnings", p["2total_gross"]),
              summaryRow("Income Tax", p["4income_tax"]),
              summaryRow("Total Gross Deductions", p["5total_deductions"]),
              summaryRow("Total Net Earnings", p["6net_pay"])
            )
          )
        )
      ),

      /* FOOTER */
      React.createElement("div", { className: "footer" }, "Powered by IPPIS - SoftSuite")
    )
  );
}

/* ---------- HELPERS ---------- */

function detailRow(l1, v1, l2, v2) {
  return React.createElement(
    "tr",
    null,
    cell(l1, v1),
    cell(l2, v2)
  );
}

function cell(label, value) {
  return React.createElement(
    "td",
    null,
    label ? React.createElement("span", { className: "label" }, `${label}: `) : null,
    value || "-"
  );
}

function headerRow(a, b) {
  return React.createElement(
    "tr",
    { className: "table-header" },
    React.createElement("td", null, a),
    React.createElement("td", { className: "amount" }, b)
  );
}


function rowsByPrefix(p, prefixes) {
  if (!Array.isArray(prefixes)) prefixes = [prefixes];

  return Object.entries(p || {})
    .filter(([k, v]) =>
      prefixes.some(pr => k.startsWith(pr)) && !isNaN(Number(v))
    )
    .map(([k, v], i) =>
      React.createElement("tr", { key: i },
        React.createElement("td", null, k.replace(/[0-9_]/g, " ")),
        React.createElement("td", { className: "amount" }, naira(v))
      )
    );
}

function summaryRow(label, value) {
  return React.createElement(
    "tr",
    null,
    React.createElement("td", null, label),
    React.createElement("td", { className: "amount" }, naira(value))
  );
}

module.exports = PayslipTemplate;
