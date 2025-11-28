const { getSession, verifyConnection, closeDriver } = require('./src/backend/neo4j');

const verify = async () => {
    const connected = await verifyConnection();
    if (!connected) {
        console.error('Neo4j not connected.');
        process.exit(1);
    }

    const session = getSession();
    try {
        // 1. Count Boards
        const boardCount = await session.run('MATCH (b:Board) RETURN count(b) as count');
        console.log(`Total Boards: ${boardCount.records[0].get('count')}`);

        // 2. Count Items
        const itemCount = await session.run('MATCH (n) WHERE NOT n:Board RETURN count(n) as count');
        console.log(`Total Items: ${itemCount.records[0].get('count')}`);

        // 3. Check a specific board (e.g., 민원서비스)
        const boardName = '민원서비스';
        const boardResult = await session.run(`
            MATCH (b:Board {name: $name})
            RETURN b
        `, { name: boardName });

        if (boardResult.records.length > 0) {
            console.log(`Found Board: ${boardName}`);
            const itemsResult = await session.run(`
                MATCH (b:Board {name: $name})-[:CONTAINS]->(n)
                RETURN n.instanceName as name, labels(n) as labels, n.id as id
                LIMIT 5
            `, { name: boardName });

            console.log('Sample Items:');
            itemsResult.records.forEach(record => {
                console.log(` - [${record.get('labels')[0]}] ${record.get('name')} (${record.get('id')})`);
            });
        } else {
            console.warn(`Board '${boardName}' not found!`);
        }

    } catch (error) {
        console.error('Verification failed:', error);
    } finally {
        await session.close();
        await closeDriver();
    }
};

verify();
