const puppeteer = require("puppeteer");
const React = require("react");
const ReactDOMServer = require("react-dom/server");
const prisma = require("../../prisma/client");
const PayslipTemplate = require("../pdf/PayslipTemplate");

exports.generatePayslipPdf = async (req, res) => {
  try {
    const ippis = String(req.params.ippis || "").toUpperCase();

    const record = await prisma.PayslipRecord.findFirst({
      where: { ippis_number: ippis },
      orderBy: { id: "desc" },
    });

    if (!record?.data) {
      return res.status(404).json({ message: "Payslip not found" });
    }

    const html = ReactDOMServer.renderToStaticMarkup(
      React.createElement(PayslipTemplate, {
        p: record.data,
        ippis,
      })
    );

    const browser = await puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const page = await browser.newPage();
    await page.setContent(`<!DOCTYPE html>${html}`, { waitUntil: "load" });

    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
    });

    await browser.close();

    res.setHeader("Content-Type", "application/pdf");
   res.setHeader(
  "Content-Disposition",
  `attachment; filename="Payslip_${ippis}.pdf"`
);

    res.end(pdf);

  } catch (err) {
    console.error("PDF ERROR:", err);
    res.status(500).json({ message: "PDF generation failed" });
  }
};
