import NIGERIAN_BANKS from "./nigerianBanks.js";

/*
 Detect bank using account number patterns
*/

const detectBankFromAccount = (accountNumber) => {

  if (!accountNumber || accountNumber.length !== 10) return null;

  const firstDigit = accountNumber[0];

  /*
    Simple heuristic mapping
  */

  if (["2","3","4"].includes(firstDigit)) {
    return { bankCode:"033", bankName:NIGERIAN_BANKS["033"] }; // UBA
  }

  if (["0","1"].includes(firstDigit)) {
    return { bankCode:"058", bankName:NIGERIAN_BANKS["058"] }; // GTBank
  }

  if (["5","6"].includes(firstDigit)) {
    return { bankCode:"044", bankName:NIGERIAN_BANKS["044"] }; // Access
  }

  if (["7","8","9"].includes(firstDigit)) {
    return { bankCode:"057", bankName:NIGERIAN_BANKS["057"] }; // Zenith
  }

  return null;
};

export default detectBankFromAccount;
