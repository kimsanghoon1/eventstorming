const neo4j = require('neo4j-driver');

const uri = process.env.NEO4J_URI || 'bolt://127.0.0.1:7687';
const user = process.env.NEO4J_USER || 'neo4j';
const password = process.env.NEO4J_PASSWORD || 'password';

let driver;

try {
    driver = neo4j.driver(uri, neo4j.auth.basic(user, password));
    console.log(`[Neo4j] Driver created for ${uri}`);
} catch (error) {
    console.error('[Neo4j] Failed to create driver:', error);
}

const getSession = () => {
    if (!driver) {
        throw new Error('[Neo4j] Driver not initialized');
    }
    return driver.session();
};

const closeDriver = async () => {
    if (driver) {
        await driver.close();
        console.log('[Neo4j] Driver closed');
    }
};

// Verify connection on startup
const verifyConnection = async () => {
    if (!driver) return false;
    const session = driver.session();
    try {
        await session.run('RETURN 1');
        console.log('[Neo4j] Connection verified successfully');
        return true;
    } catch (error) {
        console.error('[Neo4j] Connection verification failed:', error);
        return false;
    } finally {
        await session.close();
    }
};

module.exports = {
    driver,
    getSession,
    closeDriver,
    verifyConnection
};
