const { corePost } = require("../utils/coreBankingService");

exports.onboardCustomer = async (req, res) => {
  try {
    const {
      lastName, otherNames, gender, dob, address, city,
      email, phone, bvn, nin, placeOfBirth,
      accountOfficerCode, productCode
    } = req.body;

    if (!lastName || !otherNames || !gender || !dob || !address || !phone)
      return res.status(400).json({ success: false, message: "Missing required fields" });

    const payload = {
      LastName: lastName,
      OtherNames: otherNames,
      PhoneNo: phone,
      Email: email,
      Gender: gender,
      DateOfBirth: dob,
      Address: address,
      City: city ?? "Lagos",
      PlaceOfBirth: placeOfBirth,
      NationalIdentityNo: nin,
      BankVerificationNumber: bvn,
      AccountOfficerCode: accountOfficerCode,
      ProductCode: productCode,   // 🚀 account will open automatically
      HasCompleteDocumentation: true
    };

    const result = await corePost(`/Customer/CreateCustomerAndAccountTier2/2`, payload);

    res.status(201).json({
      success: true,
      message: "Customer onboarded + account created",
      data: result
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Onboarding failed",
      error: err.response?.data || err.message
    });
  }
};
