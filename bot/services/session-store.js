/**
 * Shared in-memory session store for interactive bot flows.
 *
 * Note: production deployments should use Redis or another shared store.
 */

// Map<telegramId:number, session:object>
const userSessions = new Map();

// Map<telegramId:number, { createdAt:number, expiresAt:number, byIndex:Object, byHash:Object }>
// Used for ephemeral /list -> /delete index mappings.
const taskIndexMaps = new Map();

module.exports = { userSessions, taskIndexMaps };
