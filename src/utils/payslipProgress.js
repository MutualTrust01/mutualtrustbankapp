const clients = new Map();
const progressStore = new Map();

exports.addClient = (uploadId, res) => {
  clients.set(uploadId, res);
};

exports.removeClient = (uploadId) => {
  clients.delete(uploadId);
};

exports.sendProgress = (uploadId, payload) => {
  progressStore.set(uploadId, payload);
  console.log("SAVE PROGRESS:", uploadId, payload);

  const client = clients.get(uploadId);
  if (client) {
    client.write(`data: ${JSON.stringify(payload)}\n\n`);
  }
};

exports.getProgress = (uploadId) => {
  const progress = progressStore.get(uploadId) || null;
  console.log("READ PROGRESS:", uploadId, progress);
  return progress;
};
