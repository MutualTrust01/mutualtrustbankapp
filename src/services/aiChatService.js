const knowledge = require("../data/mutaKnowledge");

function normalize(text) {
  return text.toLowerCase();
}

async function getAIResponse(message) {

  const msg = normalize(message);

  for (const item of knowledge) {

    for (const keyword of item.keywords) {

      if (msg.includes(keyword)) {
        return item.reply;
      }

    }

  }

  return "👨‍💼 I’m not sure I understood that. I will connect you to a support agent shortly.";
}

module.exports = { getAIResponse };
