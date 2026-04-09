const { postToCore } = require("./src/utils/coreBankingService");

const payload = {
  HasCompleteDocumentation: true,
  LastName: "Tester",
  OtherNames: "API User",
  Address: "Test Location",
  City: "Lagos",
  Gender: "Male",
  DateOfBirth: "1990-01-01",
  PhoneNo: "08000000000",
  PlaceOfBirth: "Nigeria",
  NationalIdentityNo: "A12345678",
  BankVerificationNumber: "22345678901",
  Email: "dummy@mail.com",
  AccountOfficerCode: "MT001"
};

// every possible customer function we try automatically
const endpoints = [
  "CreateCustomer",
  "CreateCustomerBasic",
  "CreateCustomerRecord",
  "CreateIndividualCustomer",
  "CreateIndividualCustomerRecord",
  "AddCustomer",
  "AddCustomerRecord",
  "AddCustomerBasicRecord",
  "RegisterCustomer",
  "RegisterCustomerBasic",
  "OnboardCustomer",
  "CustomerOnboarding",
  "NewCustomer",
  "NewCustomerRecord",
  "PostCustomer",
  "CustomerCreate",
  "AddIndividualCustomer"
];

// loop and test automatically
(async () => {
  for (const method of endpoints) {
    const url = `/Customer/${method}`;

    try {
      console.log(`\n🔍 Testing -> ${url}`);
      const res = await postToCore(url, payload);
      console.log(`\n🔥 SUCCESS FOUND -> ${url}`);
      console.log(res);
      process.exit(0);          // stop once correct endpoint is detected
    } catch (err) {
      console.log(`❌ 404/Failed -> ${url}`);
    }
  }

  console.log("\n❗ No valid endpoint detected — send me output, we'll extend scan list.");
})();
