module.exports = {
  /* ===============================
     CUSTOMER APIs
  ================================ */
CUSTOMER: {
  /* ===============================
     CREATE / UPDATE
  ================================ */

  // ✔ Create customer
  CREATE:
    "/BankOneWebAPI/api/Customer/CreateCustomer/2",

  // ✔ Update customer
  UPDATE:
    "/BankOneWebAPI/api/Customer/UpdateCustomer/2",

  // ✔ Create organization (corporate) customer
  CREATE_ORGANIZATION:
    "/BankOneWebAPI/api/Customer/CreateOrganizationCustomer/2",


  /* ===============================
     CUSTOMER LOOKUPS (UNCHANGED)
  ================================ */

  // ✔ Get customer by customer ID
GET_BY_ID:
"/BankOneWebAPI/api/Customer/GetByCustomerID/2",



  // ✔ Get customer by phone number
  GET_BY_PHONE:
    "/BankOneWebAPI/api/Customer/GetByCustomerPhoneNumber/2",

  // ✔ Get customer by account number
  GET_BY_ACCOUNT:
    "/BankOneWebAPI/api/Customer/GetByAccountNumber/2",

  // ✔ Get customer by BVN
  GET_BY_BVN:
    "/BankOneWebAPI/api/Customer/GetCustomerByBVN/2",


  /* ===============================
     EXISTENCE CHECKS
  ================================ */

  // ✔ Check if phone number exists
  PHONE_NUMBER_EXIST:
    "/BankOneWebAPI/api/Customer/PhoneNumberExist/2",

  // ✔ Check if email exists
  EMAIL_EXIST:
    "/BankOneWebAPI/api/Customer/EmailExist/2",


  /* ===============================
     DOCUMENTS & KYC
  ================================ */

  // ✔ Update customer passport
  UPDATE_PASSPORT:
    "/BankOneWebAPI/api/Customer/UpdatePassport/2",

  // ✔ Save customer identification
  SAVE_IDENTIFICATION:
    "/BankOneWebAPI/api/Customer/SaveCustomerIdentification/2",
},


  /* ===============================
     ACCOUNT APIs
  ================================ */
  ACCOUNT: {
  /* ===============================
     ACCOUNT CREATION
  ================================ */

  CREATE_ACCOUNT_QUICK:
    "/BankOneWebAPI/api/Account/CreateAccountQuick/2",

  CREATE_CUSTOMER_AND_ACCOUNT:
    "/BankOneWebAPI/api/Account/CreateCustomerAndAccount/2",

  ADD_ACCOUNT_TO_CUSTOMER:
    "/BankOneWebAPI/api/Account/AddAccountToCustomer/2",


  /* ===============================
     ACCOUNT ENQUIRIES
  ================================ */

  ACCOUNT_ENQUIRY:
    "/BankOneWebAPI/api/Account/AccountEnquiry/2",

  BALANCE_ENQUIRY:
    "/BankOneWebAPI/api/Account/GetAccountBalance/2",

 GET_BY_CUSTOMER_ID:
  "/BankOneWebAPI/api/Account/GetAccountsByCustomerId/2",


  GET_BY_TRACKING_REF:
    "/BankOneWebAPI/api/Account/GetAccountByTransactionTrackingRef/2",

  ACCOUNT_SUMMARY:
    "/BankOneWebAPI/api/Account/GetAccountSummary/2",


  /* ===============================
     TRANSACTIONS
  ================================ */

  GET_TRANSACTIONS:
    "/BankOneWebAPI/api/Account/GetTransactions/2",

  GENERATE_ACCOUNT_STATEMENT:
    "/BankOneWebAPI/api/Account/GenerateAccountStatement2/2",


  /* ===============================
     ACCOUNT UPDATES
  ================================ */

  UPDATE_ACCOUNT:
    "/BankOneWebAPI/api/Account/UpdateAccount/2",

  UPDATE_ACCOUNT_TIER2:
    "/BankOneWebAPI/api/Account/UpdateAccountTier2/2",

  UPDATE_NOTIFICATION_PREFERENCE:
    "/BankOneWebAPI/api/Account/UpdateAccountNotificationPreference/2",


  /* ===============================
     ACCOUNT STATUS / CONTROL
  ================================ */

  CLOSE_ACCOUNT:
    "/BankOneWebAPI/api/Account/CloseAccount/2",


  /* ===============================
     FREEZE / UNFREEZE
  ================================ */

  FREEZE_ACCOUNT:
    "/thirdpartyapiservice/apiservice/Account/FreezeAccount",

  UNFREEZE_ACCOUNT:
    "/thirdpartyapiservice/apiservice/Account/UnfreezeAccount",

  CHECK_FREEZE_STATUS:
    "/thirdpartyapiservice/apiservice/Account/CheckFreezeStatus",


  /* ===============================
     LIEN MANAGEMENT
  ================================ */

  PLACE_LIEN:
    "/thirdpartyapiservice/apiservice/Account/PlaceLien",

  REMOVE_LIEN:
    "/thirdpartyapiservice/apiservice/Account/UnPlaceLien",

  CHECK_LIEN_STATUS:
    "/thirdpartyapiservice/apiservice/Account/CheckLienStatus",


  /* ===============================
     POST-NO-DEBIT (PND)
  ================================ */

  ACTIVATE_PND:
    "/thirdpartyapiservice/apiservice/Account/ActivatePND",

  DEACTIVATE_PND:
    "/thirdpartyapiservice/apiservice/Account/DeactivatePND",

  CHECK_PND_STATUS:
    "/thirdpartyapiservice/apiservice/Account/CheckPostNoDebitStatus",


  /* ===============================
     BVN
  ================================ */

  RETRIEVE_BVN_DETAILS:
    "/thirdpartyapiservice/apiservice/Account/BVN/GetBVNDetails",


  /* ===============================
     DOCUMENTS
  ================================ */

  UPLOAD_SUPPORTING_DOCUMENTS:
    "/BankOneWebAPI/api/Account/UploadSupportingDocument/2",
},


  /* ===============================
     ACCOUNT OFFICER APIs
  ================================ */
  ACCOUNT_OFFICER: {
    GET_ALL: "/BankOneWebAPI/api/AccountOfficer/Get/2",
    GET_BY_STAFF_CODE:
      "/BankOneWebAPI/api/AccountOfficer/GetByStaffCode/2",
  },

  /* ===============================
     MESSAGING APIs
  ================================ */
  MESSAGING: {
    SEND_BULK_SMS:
      "/BankOneWebAPI/api/Messaging/SaveBulkSms/2",
  },

  /* ===============================
     PRODUCTS APIs
  ================================ */
  PRODUCTS: {
    GET_ALL: "/BankOneWebAPI/api/Product/Get/2",
    GET_BY_CODE: "/BankOneWebAPI/api/Product/GetByCode/2",
  },

  /* ===============================
     FIXED DEPOSIT APIs
  ================================ */
  FIXED_DEPOSIT: {
    CREATE:
      "/BankOneWebAPI/api/FixedDeposit/CreateFixedDepositAcct/2",

    GET_BY_LIQUIDATION_ACCOUNT:
      "/BankOneWebAPI/api/FixedDeposit/GetFixedDepositAccountByLiquidationAccount/2",

    GET_BY_PHONE_NUMBER:
      "/BankOneWebAPI/api/FixedDeposit/GetFixedDepositAccountByPhoneNumber/2",

    TOP_UP:
      "/BankOneWebAPI/api/FixedDeposit/TopUpFixedDepositAccount/2",

      GET_DETAILS:
    "/BankOneWebAPI/api/FixedDeposit/GetFixedDepositAccountDetails/2",
  },



/* ===============================
   LOAN APIs
================================ */
LOAN: {
  CREATE_APPLICATION:
    "/BankOneWebAPI/api/LoanApplication/LoanCreationApplication2/2",

  GET_BY_CUSTOMER_ID:
    "/BankOneWebAPI/api/Loan/GetLoansByCustomerId/2",

  GET_REPAYMENT_SCHEDULE:
    "/BankOneWebAPI/api/Loan/GetLoanRepaymentSchedule/2",

   
},

LOAN_ACCOUNT: {
  GET_BALANCE:
  "/BankOneWebAPI/api/Loan/GetLoanByAccountNumber/2",

  GET_STATEMENT:
    "/BankOneWebAPI/api/LoanAccount/LoanAccountStatement/2",

  REPAY_LOAN:
    "/BankOneWebAPI/api/LoanAccount/RepayLoan/2",
},


/* ===============================
   TRANSFER APIs
================================ */
TRANSFER: {
  /* ===============================
     BANK LIST / LOOKUP
  ================================ */

  // ✔ Get commercial banks
  GET_COMMERCIAL_BANKS:
    "/ThirdPartyAPIService/APIService/BillsPayment/GetCommercialBanks/{Token}",


  /* ===============================
     NAME ENQUIRY
  ================================ */

  // ✔ Name enquiry (interbank)
  NAME_ENQUIRY:
    "/thirdpartyapiservice/apiservice/Transfer/NameEnquiry",


  /* ===============================
     INTERBANK TRANSFER
  ================================ */

  // ✔ Inter bank transfer
  INTERBANK_TRANSFER:
    "/thirdpartyapiservice/apiservice/Transfer/InterBankTransfer",


  /* ===============================
     TRANSACTION STATUS
  ================================ */

  // ✔ Transaction status query (Interbank transfers)
  TRANSACTION_STATUS_QUERY:
    "/thirdpartyapiservice/apiservice/Transactions/TransactionStatusQuery",
},


/* ===============================
   LOCAL (INTRA-BANK) TRANSACTIONS
================================ */
LOCAL_TRANSACTIONS: {
  /* ===============================
     INTRA BANK TRANSFER
  ================================ */

  // ✔ Intra Bank (Local) Fund Transfer
  INTRA_BANK_FUND_TRANSFER:
    "/thirdpartyapiservice/apiservice/CoreTransactions/LocalFundsTransfer",


  /* ===============================
     CREDIT / DEBIT
  ================================ */

  // ✔ Credit customer account
  CREDIT_CUSTOMER_ACCOUNT:
    "/thirdpartyapiservice/apiservice/CoreTransactions/Credit",

  // ✔ Debit customer account
  DEBIT_CUSTOMER_ACCOUNT:
    "/thirdpartyapiservice/apiservice/CoreTransactions/Debit",


  /* ===============================
     TRANSACTION STATUS
  ================================ */

  // ✔ Transaction status query (Intra-bank, Debit & Credit)
  TRANSACTION_STATUS_QUERY:
    "/thirdpartyapiservice/apiservice/CoreTransactions/TransactionStatusQuery",


  /* ===============================
     REVERSALS
  ================================ */

  // ✔ Reverse a transaction
  REVERSAL:
    "/thirdpartyapiservice/apiservice/CoreTransactions/Reversal",
},


/* ===============================
   CARDS APIs
================================ */
CARDS: {
  /* ===============================
     CONFIG & SETUP
  ================================ */

  // ✔ Retrieve institution card configurations
  RETRIEVE_INSTITUTION_CONFIG:
    "/thirdpartyapiservice/apiservice/Cards/RetrieveInstitutionConfig/{Token}",

  // ✔ Get card delivery options
  GET_CARD_DELIVERY_OPTIONS:
    "/thirdpartyapiservice/apiservice/Cards/GetCardDeliveryOptions/{Token}",


  /* ===============================
     CARD ISSUANCE
  ================================ */

  // ✔ Request a new card
  CARD_REQUEST:
    "/thirdpartyapiservice/apiservice/Cards/RequestCard",

  // ✔ Check card generation status
  CHECK_CARD_GENERATION_STATUS:
    "/thirdpartyapiservice/apiservice/Cards/CheckCardGenerationStatus",


  /* ===============================
     CARD RETRIEVAL & LINKING
  ================================ */

  // ✔ Get customer cards
  GET_CUSTOMER_CARDS:
    "/thirdpartyapiservice/apiservice/Cards/RetrieveCustomerCards",

  // ✔ Link card to customer account
  LINK_CARD_TO_CUSTOMER_ACCOUNT:
    "/thirdpartyapiservice/apiservice/Cards/LinkCustomerCard",


  /* ===============================
     CARD STATUS CONTROLS
  ================================ */

  // ✔ Hotlist customer card
  HOTLIST_CUSTOMER_CARD:
    "/thirdpartyapiservice/apiservice/Cards/HotlistCard",

  // ✔ Freeze customer card
  FREEZE_CARD:
    "/thirdpartyapiservice/apiservice/Cards/Freeze",

  // ✔ Unfreeze customer card
  UNFREEZE_CARD:
    "/thirdpartyapiservice/apiservice/Cards/UnFreeze",


  /* ===============================
     TRANSACTION LIMITS
  ================================ */

  // ✔ Add transaction limit to customer card
  ADD_TRANSACTION_LIMIT:
    "/thirdpartyapiservice/apiservice/Cards/TransactionLimit/Add",

  // ✔ View transaction limit on customer card
  VIEW_TRANSACTION_LIMIT:
    "/thirdpartyapiservice/apiservice/Cards/TransactionLimit/View",

  // ✔ Update transaction limit on customer card
  UPDATE_TRANSACTION_LIMIT:
    "/thirdpartyapiservice/apiservice/Cards/TransactionLimit/Update",


  /* ===============================
     CHANNEL CONTROLS
  ================================ */

  // ✔ Disable channel for customer card
  DISABLE_CARD_CHANNEL:
    "/thirdpartyapiservice/apiservice/Cards/RestrictChannelAccess",

  // ✔ Re-enable channel for customer card
  ENABLE_CARD_CHANNEL:
    "/thirdpartyapiservice/apiservice/Cards/ReActivateChannelAccess",
},


/* ===============================
   OVERDRAFT APIs
================================ */
OVERDRAFT: {
  /* ===============================
     CREATE OVERDRAFT
  ================================ */

  // ✔ Create overdraft for customer account
  CREATE_OVERDRAFT:
    "/BankOneWebAPI/api/Overdraft/Create/2",


  /* ===============================
     OVERDRAFT LOOKUPS
  ================================ */

  // ✔ Get overdraft interests
  GET_OVERDRAFT_INTERESTS:
    "/BankOneWebAPI/api/Overdraft/GetOverdraftInterests/2",

  // ✔ Get overdraft fees
  GET_OVERDRAFT_FEES:
    "/BankOneWebAPI/api/Overdraft/Overdraft_GetOverdraftFees/2",

  // ✔ Get overdraft outstanding
  GET_OVERDRAFT_OUTSTANDING:
    "/BankOneWebAPI/api/Overdraft/GetOverdraftOutstanding/2",

  // ✔ Get customer's overdraft
  GET_OVERDRAFT:
    "/BankOneWebAPI/api/Overdraft/GetOverdraft/2",
},


/* ===============================
   BILLS PAYMENT APIs
================================ */
BILLS_PAYMENT: {
  /* ===============================
     BILLERS & CATEGORIES
  ================================ */

  // ✔ Get all billers
  GET_BILLERS:
    "/ThirdPartyAPIService/APIService/BillsPayment/GetBillers/{Token}",

  // ✔ Get billers category
  GET_BILLERS_CATEGORY:
    "/ThirdPartyAPIService/APIService/BillsPayment/GetBillerCategories/{Token}",


  /* ===============================
     PAYMENT ITEMS
  ================================ */

  // ✔ Get payment items for a biller
  GET_PAYMENT_ITEMS:
    "/ThirdPartyAPIService/APIService/BillsPayment/GetPaymentItems/{Token}",


  /* ===============================
     BILL PAYMENT TRANSACTIONS
  ================================ */

  // ✔ Initiate bills payment transaction
  INITIATE_BILLS_PAYMENT:
    "/ThirdPartyAPIService/APIService/BillsPayment/Payment",
},


/* ===============================
   STANDING ORDER APIs
================================ */
STANDING_ORDER: {
  /* ===============================
     CREATE
  ================================ */

  // ✔ Create standing order application
  CREATE_STANDING_ORDER:
    "/BankOneWebAPI/api/StandingOrder/StandingOrderCreationApplication2/2",


  /* ===============================
     RETRIEVE
  ================================ */

  // ✔ Get standing orders by debit account number
  GET_STANDING_ORDERS_BY_DEBIT_ACCOUNT:
    "/BankOneWebAPI/api/StandingOrder/GetStandingOrdersByDebit/2",


  /* ===============================
     CANCEL
  ================================ */

  // ✔ Cancel standing order
  CANCEL_STANDING_ORDER:
    "/BankOneWebAPI/api/StandingOrder/CancelStandingOrder/2",
},



};



