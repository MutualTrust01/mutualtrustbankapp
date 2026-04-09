const React = require("react");
const ReactDOMServer = require("react-dom/server");
const PayslipTemplate = require("../pdf/PayslipTemplate");

exports.testPayslipHtml = async (req, res) => {
  const html = ReactDOMServer.renderToStaticMarkup(
    React.createElement(PayslipTemplate, {
      name: "JOHN DOE",
      month: "JUNE 2025",
    })
  );

  res.setHeader("Content-Type", "text/html");
  res.send(`<!DOCTYPE html>${html}`);
};
