const axios = require("axios");
const xml2js = require("xml2js");

/* ===============================
   VALIDATE ENV (NO RENAMING)
================================ */
if (!process.env.CORE_API_KEY) {
  throw new Error("CORE_API_KEY missing in server configuration");
}

if (!process.env.CORE_BASE_URL) {
  throw new Error("CORE_BASE_URL missing in server configuration");
}


/* ===============================
   AXIOS INSTANCE
================================ */
const coreClient = axios.create({
  baseURL: process.env.CORE_BASE_URL,
  timeout: 30000,
  headers: {
    Accept: "application/json",
    "Content-Type": "application/json",
  },
});

/* ===============================
   RETRY HANDLER (CORE TIMEOUT FIX)
================================ */
coreClient.interceptors.response.use(null, async (error) => {

  const config = error.config;

  if (!config) {
    return Promise.reject(error);
  }

  config.__retryCount = config.__retryCount || 0;

  // Retry up to 2 times if timeout
  if (error.code === "ECONNABORTED" && config.__retryCount < 2) {

    config.__retryCount += 1;

    console.log(`⚠️ CORE TIMEOUT — retrying request (${config.__retryCount})`);

    return coreClient(config);
  }

  return Promise.reject(error);

});


/* ===============================
   REQUEST INTERCEPTOR
================================ */
coreClient.interceptors.request.use(
  (config) => {

const url = (config.url || "").toLowerCase();
const isThirdParty = url.includes("thirdpartyapiservice");

// 🔥 Inject for ALL third-party endpoints INCLUDING NameEnquiry
if (isThirdParty) {
  config.data = {
    ...(config.data || {}),
    AuthToken: process.env.CORE_API_KEY,
    MFBCode: process.env.MFB_CODE,
  };

  if (process.env.NODE_ENV !== "production") {
    console.log(
      "🌍 CORE REQUEST →",
      config.method?.toUpperCase(),
      config.url,
      config.data
    );
  }
} else {
  // Regular core APIs
  config.params = {
    ...(config.params || {}),
    authToken: process.env.CORE_API_KEY,
  };

  if (process.env.NODE_ENV !== "production") {
    console.log(
      "🌍 CORE REQUEST →",
      config.method?.toUpperCase(),
      config.url,
      config.params
    );
  }
}    

    return config;
  },
  (error) => Promise.reject(error)
);

/* ===============================
   RESPONSE INTERCEPTOR
================================ */
coreClient.interceptors.response.use(
  async (response) => {
    // If the response is XML (i.e., starts with '<'), parse it as XML
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
(error) => {
  console.error("❌ CORE RAW ERROR:", error);

  let message = "Core banking error";

  if (error.response?.data) {
    message =
      error.response.data.ResponseMessage ||
      error.response.data.Message ||
      JSON.stringify(error.response.data);
  } else if (typeof error.message === "string") {
    message = error.message;
  }

  const customError = new Error(message);

  // 🔥 VERY IMPORTANT — attach full response
  customError.response = error.response;

  return Promise.reject(customError);
}  

);

module.exports = coreClient;
