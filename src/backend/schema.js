const { getSession, verifyConnection, closeDriver } = require('./neo4j');

const schemaQueries = [
    // Constraints (Uniqueness)
    'CREATE CONSTRAINT IF NOT EXISTS FOR (n:BoundedContext) REQUIRE n.id IS UNIQUE',
    'CREATE CONSTRAINT IF NOT EXISTS FOR (n:Command) REQUIRE n.id IS UNIQUE',
    'CREATE CONSTRAINT IF NOT EXISTS FOR (n:Event) REQUIRE n.id IS UNIQUE',
    'CREATE CONSTRAINT IF NOT EXISTS FOR (n:Aggregate) REQUIRE n.id IS UNIQUE',
    'CREATE CONSTRAINT IF NOT EXISTS FOR (n:Policy) REQUIRE n.id IS UNIQUE',
    'CREATE CONSTRAINT IF NOT EXISTS FOR (n:ReadModel) REQUIRE n.id IS UNIQUE',
    'CREATE CONSTRAINT IF NOT EXISTS FOR (n:ExternalSystem) REQUIRE n.id IS UNIQUE',
    'CREATE CONSTRAINT IF NOT EXISTS FOR (n:UmlBoard) REQUIRE n.id IS UNIQUE',
    'CREATE CONSTRAINT IF NOT EXISTS FOR (n:Class) REQUIRE n.id IS UNIQUE',

    // Indexes (Performance)
    'CREATE INDEX IF NOT EXISTS FOR (n:Command) ON (n.name)',
    'CREATE INDEX IF NOT EXISTS FOR (n:Event) ON (n.name)',
    'CREATE INDEX IF NOT EXISTS FOR (n:Aggregate) ON (n.name)'
];

const applySchema = async () => {
    const connected = await verifyConnection();
    if (!connected) {
        console.error('[Schema] Cannot apply schema: Neo4j not connected');
        process.exit(1);
    }

    const session = getSession();
    try {
        console.log('[Schema] Applying constraints and indexes...');
        for (const query of schemaQueries) {
            await session.run(query);
            console.log(`[Schema] Executed: ${query}`);
        }
        console.log('[Schema] Schema applied successfully.');
    } catch (error) {
        console.error('[Schema] Error applying schema:', error);
    } finally {
        await session.close();
        await closeDriver();
    }
};

if (require.main === module) {
    applySchema();
}

module.exports = { applySchema };
