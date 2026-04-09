const axios = require("axios");
const xml2js = require("xml2js");

/* =====================================
   VALIDATE ENV (NO RENAMING)
===================================== */
if (!process.env.CORE_API_KEY) {
  throw new Error("CORE_API_KEY missing in server configuration");
}

if (!process.env.CORE_BASE_URL) {
  throw new Error("CORE_BASE_URL missing in server configuration");
}

/* =====================================
   AXIOS INSTANCE
===================================== */
const coreClient = axios.create({
  baseURL: process.env.CORE_BASE_URL,
  timeout: 30000,
  headers: {
    Accept: "application/json, application/xml, text/xml",
    "Content-Type": "application/json",
  },
});

/* =====================================
   REQUEST INTERCEPTOR
   🔐 Inject authToken automatically
===================================== */
coreClient.interceptors.request.use(
  config => {

    const url = config.url || "";
    const isNameEnquiry = url.includes("NameEnquiry");

    // ❌ Do NOT inject authToken for NameEnquiry
    if (!isNameEnquiry) {
      config.params = {
        ...(config.params || {}),
        authToken: process.env.CORE_API_KEY,
      };

      const token = process.env.CORE_API_KEY;
      config.headers.Authorization = `Bearer ${token}`;
    }

    console.log(
      "🌍 CORE REQUEST →",
      config.method?.toUpperCase(),
      config.url
    );

    return config;
  },
  error => Promise.reject(error)
);


/* =====================================
   RESPONSE INTERCEPTOR
   🔥 Handle XML OR JSON safely
===================================== */
coreClient.interceptors.response.use(
  async response => {
    if (
      typeof response.data === "string" &&
      response.data.trim().startsWith("<")
    ) {
      const parsed = await xml2js.parseStringPromise(response.data, {
        explicitArray: false,
        ignoreAttrs: true,
      });

      response.data = parsed;
    }

    return response;
  },
  error => {
    console.error(
      "❌ CORE ERROR:",
      error.response?.data || error.message
    );
    return Promise.reject(error);
  }
);

module.exports = coreClient;
