const pool = require("../../db");

const customerService = require("../core/customer.service");
const LoanService = require("../core/loan.service");
const smsService = require("../core/sms.service");

const coreBankingClient = require("../utils/coreBankingClient");
const ENDPOINTS = require("../utils/coreEndpoints");

const jwt = require("jsonwebtoken");

class CustomerLoanService {

/*
=================================
REQUEST ACCESS
=================================
*/
static async requestAccess(identifier) {

let customer = null;

try {

if (identifier.length === 11 && identifier.startsWith("0")) {

const customerData =
await customerService.getCustomerByPhone(identifier);

const fullName =
customerData?.fullName ||
`${customerData?.FirstName || ""} ${customerData?.LastName || ""}`.trim();

customer = {
customerId:
customerData?.CustomerID ||
customerData?.customerID ||
customerData?.CustomerId ||
customerData?.id ||
customerData?.customerId ||
null,

phone:
customerData?.PhoneNumber ||
customerData?.phone ||
identifier,

fullName
};

}

else if (identifier.length === 11) {

const res =
await coreBankingClient.get(
ENDPOINTS.CUSTOMER.GET_BY_BVN,
{
params: { BVN: identifier }
}
);

const data = res?.data;

if (data?.IsSuccessful && data?.Message) {

const msg = data.Message;

customer = {
customerId: msg.CustomerID || msg.customerID,
phone: msg.PhoneNumber,
fullName: `${msg.FirstName || ""} ${msg.LastName || ""}`.trim()
};

}

}

} catch (error) {

console.error("Core customer lookup failed:", error.message);

return {
success: false,
status: "CORE_ERROR",
message: "Unable to retrieve customer information"
};

}

if (!customer || !customer.customerId) {

return {
success: false,
status: "NO_CUSTOMER",
message: "Customer not found"
};

}

/*
=================================
GET CUSTOMER LOANS
=================================
*/

let loans = [];
let loanAccountNumber = null;
let loanBalance = null;

try {

const loanRes =
await LoanService.getLoansByCustomerId(
customer.customerId
);

const coreResponse = loanRes?.data;

if (!coreResponse?.IsSuccessful) {

return {
success: false,
status: "CORE_LOAN_ERROR",
message: "Unable to retrieve loans"
};

}


const loanData = coreResponse?.Message || [];
loans = Array.isArray(loanData) ? loanData : [];

if (!loans.length) {
return {
success: false,
status: "NO_ACTIVE_LOAN",
message: "Customer has no loans"
};
}

} catch (error) {

console.error("Loan lookup failed:", error.message);

return {
success: false,
status: "CORE_ERROR",
message: "Unable to retrieve loan information"
};

}


/*
=================================
CHECK ACTIVE LOAN
=================================
*/

const activeStatuses = [
"ACTIVE",
"RUNNING",
"DISBURSED",
"OVERDUE"
];

const activeLoan = loans.find((loan) => {

const status =
loan?.LoanStatus ||
loan?.loanStatus ||
loan?.Status ||
"";

return activeStatuses.includes(
status.toUpperCase()
);

});

if (!activeLoan) {

return {
success: false,
status: "NO_ACTIVE_LOAN",
message: "Customer does not have an active loan"
};

}

loanAccountNumber =
activeLoan?.LoanAccountNo || null;

loanBalance = {
loanAccountNumber,
outstandingBalance:
activeLoan?.TotalOutstandingAmount || 0,
interestRate:
activeLoan?.InterestRate || null,
loanStatus:
activeLoan?.LoanStatus || "ACTIVE"
};

/*
=================================
PHONE
=================================
*/

let phone = customer.phone;

if (!phone) {

return {
success: false,
status: "NO_PHONE",
message: "Customer phone number not found"
};

}

phone = phone.replace(/^234/, "0");

/*
=================================
CHECK ACTIVATION
=================================
*/

const existing =
await pool.query(
`
SELECT *
FROM loan_customer_access
WHERE phone = $1
`,
[phone]
);

if (
existing.rows.length &&
existing.rows[0].is_activated
) {

return {
success: true,
status: "LOGIN_REQUIRED",
phone,
customerId: customer.customerId,
customerName: customer.fullName,
loanAccountNumber,
loanBalance
};

}

/*
=================================
GENERATE OTP
=================================
*/

const otp =
Math.floor(100000 + Math.random() * 900000);

const otpExpiry =
new Date(Date.now() + 5 * 60 * 1000);

await pool.query(
`
INSERT INTO loan_customer_access
(core_customer_id, phone, otp_code, otp_expires)
VALUES ($1,$2,$3,$4)
ON CONFLICT (phone)
DO UPDATE SET
otp_code = EXCLUDED.otp_code,
otp_expires = EXCLUDED.otp_expires,
updated_at = NOW()
`,
[
customer.customerId,
phone,
otp,
otpExpiry
]
);

try {

await smsService.sendSms({
phone,
message:
`Your Mutual Trust Loan Service OTP is ${otp}. Do not share this code.`
});

} catch (error) {

console.error("SMS sending failed:", error.message);

return {
success: false,
status: "SMS_FAILED",
message: "Unable to send OTP"
};

}

return {
success: true,
status: "OTP_REQUIRED",
phone,
customerName: customer.fullName,
customerId: customer.customerId,
loanAccountNumber,
loanBalance
};

}

/*
=================================
VERIFY OTP
=================================
*/

static async verifyOTP(phone, otp) {

const result = await pool.query(
`
SELECT *
FROM loan_customer_access
WHERE phone = $1
AND otp_code = $2
AND otp_expires > NOW()
`,
[phone, otp]
);

if (!result.rows.length) {

return {
success: false,
message: "Invalid or expired OTP"
};

}

const user = result.rows[0];

await pool.query(
`
UPDATE loan_customer_access
SET is_activated = true,
otp_code = NULL,
otp_expires = NULL,
updated_at = NOW()
WHERE phone = $1
`,
[phone]
);

/*
=================================
FETCH CUSTOMER LOAN AGAIN
=================================
*/

let loanBalance = null;
let loanAccountNumber = null;

try {

const loanRes =
await LoanService.getLoansByCustomerId(
user.core_customer_id
);

const loanData = loanRes?.data?.Message || [];

const activeStatuses = [
"ACTIVE",
"RUNNING",
"DISBURSED",
"OVERDUE"
];

const activeLoan = loanData.find((loan) => {

const status =
loan?.LoanStatus ||
loan?.loanStatus ||
loan?.Status ||
"";


return activeStatuses.includes(
(status || "").toUpperCase()
);

});

if (activeLoan) {

loanAccountNumber =
activeLoan?.LoanAccountNo || null;

loanBalance = {
loanAccountNumber,
outstandingBalance:
activeLoan?.TotalOutstandingAmount || 0,
interestRate:
activeLoan?.InterestRate || null,
loanStatus:
activeLoan?.LoanStatus || "ACTIVE"
};

}


} catch (err) {

console.error("Loan fetch after login failed:", err.message);

}

/*
=================================
GENERATE JWT
=================================
*/


const token = jwt.sign(
{
phone: user.phone,
customerId: user.core_customer_id
},
process.env.JWT_SECRET,
{ expiresIn: "2h" }
);

return {
success: true,
token,
phone: user.phone,
customerId: user.core_customer_id,
loanAccountNumber,
loanBalance
};

}

}

module.exports = CustomerLoanService;
