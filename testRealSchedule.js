const { calculateSchedule } = require("./src/utils/loanSchedule");

const schedule = calculateSchedule({
  principal: 2000,      // from your core response
  annualRate: 24,       // assume interest rate
  tenureMonths: 3       // short test
});

console.log("✅ SCHEDULE:");
console.log(schedule);
