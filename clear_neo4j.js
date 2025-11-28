const { getSession, verifyConnection, closeDriver } = require('./src/backend/neo4j');

/**
 * Neo4j 데이터베이스 초기화 스크립트
 * 모든 노드와 관계를 삭제합니다.
 */

const clearDatabase = async () => {
    const connected = await verifyConnection();
    if (!connected) {
        console.error('[Clear] Neo4j connection failed');
        process.exit(1);
    }

    const session = getSession();

    try {
        console.log('[Clear] Deleting all nodes and relationships...');

        await session.run('MATCH (n) DETACH DELETE n');

        console.log('[Clear] ✅ Database cleared successfully!');

    } catch (error) {
        console.error('[Clear] ❌ Error clearing database:', error);
        throw error;
    } finally {
        await session.close();
        await closeDriver();
    }
};

clearDatabase();
