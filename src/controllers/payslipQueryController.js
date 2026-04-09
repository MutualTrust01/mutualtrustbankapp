const prisma = require("../../prisma/client");

exports.getPayslipByIppis = async (req, res) => {
  try {
    const ippis = String(req.params.ippis || "")
      .trim()
      .toUpperCase();

    if (!ippis) {
      return res.status(400).json({
        success: false,
        message: "IPPIS is required",
      });
    }

    // 🔎 Fetch latest 12 payslips (history)
    const records = await prisma.PayslipRecord.findMany({
      where: {
        ippis_number: ippis,
      },
      orderBy: {
        id: "desc",
      },
      take: 12,
      select: {
        upload_month: true,
        created_at: true,
        data: true,
      },
    });

    if (!records || records.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Payslip not found",
      });
    }

    return res.status(200).json({
      success: true,
      history: records,        // full history
      latest: records[0],      // newest payslip
    });

  } catch (err) {
    console.error("❌ Payslip query error:", err);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch payslip",
    });
  }
};
