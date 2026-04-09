const service = require("../services/staffOnboardingService");

exports.createStaff = async (req, res) => {
  await service.createStaff(req.body);
  res.json({ success: true });
};

exports.uploadStaffFile = async (req, res) => {
  const result = await service.bulkUpload(req.file);
  res.json(result); // { success, errors }
};

exports.uploadDocument = async (req, res) => {
  await service.uploadDocument(req);
  res.json({ success: true });
};

exports.approve = async (req, res) => {
  await service.approve(req.body);
  res.json({ success: true });
};

exports.reject = async (req, res) => {
  await service.reject(req.body);
  res.json({ success: true });
};

exports.reopen = async (req, res) => {
  await service.reopen(req.body);
  res.json({ success: true });
};
