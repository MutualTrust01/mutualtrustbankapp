const knowledge = require("../data/mutaKnowledge");

function normalize(text) {
  return text.toLowerCase();
}

module.exports = function internalMutaAI(message) {

  const msg = normalize(message);

  for (const item of knowledge) {

    for (const keyword of item.keywords) {

      if (msg.includes(keyword)) {
        return item.reply;
      }

    }

  }

  return "I'm sorry, I didn't fully understand that. Please wait while I connect you to a support agent.";
};
