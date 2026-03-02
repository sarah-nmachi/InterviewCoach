const { CosmosClient } = require('@azure/cosmos');

const endpoint = process.env.COSMOS_DB_ENDPOINT;
const key = process.env.COSMOS_DB_KEY;
const databaseId = process.env.COSMOS_DB_DATABASE || 'interviewcoach';
const containerId = process.env.COSMOS_DB_CONTAINER || 'sessions';

let container = null;

async function getContainer() {
  if (!container) {
    const client = new CosmosClient({ endpoint, key });
    const { database } = await client.databases.createIfNotExists({ id: databaseId });
    const { container: c } = await database.containers.createIfNotExists({
      id: containerId,
      partitionKey: { paths: ['/userId'] },
      defaultTtl: 86400 // 24 hours in seconds
    });
    container = c;
  }
  return container;
}

/**
 * Save a session to Cosmos DB
 */
async function saveSession(session) {
  const c = await getContainer();
  const { resource } = await c.items.create(session);
  return resource;
}

/**
 * Get all sessions for a user
 */
async function getSessionsByUser(userId) {
  const c = await getContainer();
  const { resources } = await c.items
    .query({
      query: 'SELECT * FROM c WHERE c.userId = @userId ORDER BY c.createdAt DESC',
      parameters: [{ name: '@userId', value: userId }]
    })
    .fetchAll();
  return resources;
}

/**
 * Get a single session by ID
 */
async function getSessionById(sessionId, userId) {
  const c = await getContainer();
  try {
    const { resource } = await c.item(sessionId, userId).read();
    return resource;
  } catch (err) {
    if (err.code === 404) return null;
    throw err;
  }
}

/**
 * Update a session (e.g., add feedback)
 */
async function updateSession(sessionId, userId, updates) {
  const c = await getContainer();
  const { resource: existing } = await c.item(sessionId, userId).read();
  const updated = { ...existing, ...updates };
  const { resource } = await c.item(sessionId, userId).replace(updated);
  return resource;
}

module.exports = { saveSession, getSessionsByUser, getSessionById, updateSession };
