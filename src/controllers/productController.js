const productService = require("../core/product.service");

/* ===============================
   GET ALL PRODUCTS
================================ */
exports.getProducts = async (req, res) => {
  try {
    const products = await productService.getProducts();

    return res.json({
      success: true,
      data: products,
    });
  } catch (error) {
    console.error("❌ Product fetch failed:", error.message);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch products",
    });
  }
};

/* ===============================
   GET PRODUCT BY CODE
================================ */
exports.getProductByCode = async (req, res) => {
  try {
    const { productCode } = req.params;

    if (!productCode) {
      return res.status(400).json({
        success: false,
        message: "productCode is required",
      });
    }

    const product = await productService.getProductByCode(productCode);

    return res.json({
      success: true,
      data: product,
    });
  } catch (error) {
    console.error("❌ Product-by-code fetch failed:", error.message);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch product",
    });
  }
};
