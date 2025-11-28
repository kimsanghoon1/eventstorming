const fs = require('fs').promises;
const path = require('path');
const { getSession, verifyConnection, closeDriver } = require('./src/backend/neo4j');
const { v4: uuidv4 } = require('uuid');

const baseDataDir = path.join(__dirname, 'data');

/**
 * CanvasData 분리 구조 마이그레이션
 * 
 * 기존: { id, x, y, type, instanceName, ... }
 * 새로운: 
 *   CanvasItem { id, x, y, domainObjectId }
 *   DomainObject { id, type, instanceName, ... }
 */

// Helper to recursively find all JSON files
const getJsonFiles = async (dir) => {
    const files = [];
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === 'snapshots') continue;
            files.push(...(await getJsonFiles(fullPath)));
        } else if (entry.isFile() && entry.name.endsWith('.json')) {
            files.push(fullPath);
        }
    }
    return files;
};

// Extract domain properties from item
const extractDomainProperties = (item) => {
    const {
        // Canvas properties (제외)
        x, y, width, height, rotation,
        // Relationship properties (제외)
        parent, children, connectedPolicies, producesEventId, linkedDiagram,
        // Domain properties (포함)
        ...domainProps
    } = item;

    return domainProps;
};

// Extract canvas properties
const extractCanvasProperties = (item) => {
    return {
        x: item.x || 0,
        y: item.y || 0,
        width: item.width || 100,
        height: item.height || 60,
        rotation: item.rotation || 0
    };
};

const migrate = async () => {
    const connected = await verifyConnection();
    if (!connected) {
        console.error('[Migration] Neo4j not connected. Aborting migration.');
        process.exit(1);
    }

    const files = await getJsonFiles(baseDataDir);
    const session = getSession();

    // Track created domain objects to avoid duplicates
    const domainObjectMap = new Map(); // instanceName -> domainObjectId
    const boundedContextMap = new Map(); // contextName -> contextId

    try {
        console.log(`[Migration] Found ${files.length} files to migrate.`);

        // First pass: Create all BoundedContexts
        for (const file of files) {
            const content = await fs.readFile(file, 'utf8');
            if (!content.trim()) continue;

            const boardData = JSON.parse(content);
            if (!boardData.items) continue;

            // Find all ContextBoxes
            const contexts = boardData.items.filter(item => item.type === 'ContextBox');
            for (const context of contexts) {
                if (!context.instanceName) continue;

                if (!boundedContextMap.has(context.instanceName)) {
                    const contextId = uuidv4();
                    boundedContextMap.set(context.instanceName, contextId);

                    await session.run(`
                        CREATE (bc:BoundedContext {
                            id: $id,
                            name: $name,
                            description: $description
                        })
                    `, {
                        id: contextId,
                        name: context.instanceName,
                        description: context.description || ''
                    });

                    console.log(`[Migration] Created BoundedContext: ${context.instanceName}`);
                }
            }
        }

        // Second pass: Create Boards and migrate items
        for (const file of files) {
            const content = await fs.readFile(file, 'utf8');
            if (!content.trim()) continue;

            const boardData = JSON.parse(content);
            const relativePath = path.relative(baseDataDir, file).replace(/\\/g, '/');
            const boardId = relativePath;
            const boardType = boardData.boardType || 'Eventstorming';
            const boardName = boardData.instanceName || path.basename(file, '.json');

            console.log(`[Migration] Processing Board: ${boardName} (${boardType})`);

            // Create Board
            await session.run(`
                CREATE (b:Board {
                    id: $id,
                    name: $name,
                    boardType: $boardType,
                    path: $path
                })
            `, { id: boardId, name: boardName, boardType, path: relativePath });

            if (!Array.isArray(boardData.items)) continue;

            // Migrate items
            for (const item of boardData.items) {
                if (!item.id || !item.type) continue;

                // Extract domain and canvas properties
                const domainProps = extractDomainProperties(item);
                const canvasProps = extractCanvasProperties(item);

                // Create or reuse DomainObject
                let domainObjectId;
                const domainKey = `${item.type}:${item.instanceName}`;

                if (domainObjectMap.has(domainKey)) {
                    // Reuse existing domain object
                    domainObjectId = domainObjectMap.get(domainKey);
                    console.log(`[Migration]   Reusing DomainObject: ${item.instanceName} (${item.type})`);
                } else {
                    // Create new domain object
                    domainObjectId = uuidv4();
                    domainObjectMap.set(domainKey, domainObjectId);

                    // Find bounded context
                    let contextId = null;
                    if (item.parent) {
                        const parentItem = boardData.items.find(i => i.id === item.parent);
                        if (parentItem && parentItem.type === 'ContextBox') {
                            contextId = boundedContextMap.get(parentItem.instanceName);
                        }
                    }

                    // Sanitize properties for Neo4j
                    const sanitizedProps = {};
                    for (const [key, value] of Object.entries(domainProps)) {
                        if (value === null || value === undefined) continue;
                        if (typeof value === 'object') {
                            sanitizedProps[key] = JSON.stringify(value);
                        } else {
                            sanitizedProps[key] = value;
                        }
                    }

                    await session.run(`
                        CREATE (d:DomainObject {
                            id: $id,
                            type: $type,
                            instanceName: $instanceName,
                            description: $description,
                            properties: $properties
                        })
                    `, {
                        id: domainObjectId,
                        type: item.type,
                        instanceName: item.instanceName || '',
                        description: item.description || '',
                        properties: JSON.stringify(sanitizedProps)
                    });

                    // Link to BoundedContext
                    if (contextId) {
                        await session.run(`
                            MATCH (d:DomainObject {id: $domainId})
                            MATCH (bc:BoundedContext {id: $contextId})
                            CREATE (d)-[:BELONGS_TO]->(bc)
                        `, { domainId: domainObjectId, contextId });
                    }

                    console.log(`[Migration]   Created DomainObject: ${item.instanceName} (${item.type})`);
                }

                // Create CanvasItem
                const canvasItemId = uuidv4();
                await session.run(`
                    CREATE (c:CanvasItem {
                        id: $id,
                        x: $x,
                        y: $y,
                        width: $width,
                        height: $height,
                        rotation: $rotation,
                        boardId: $boardId,
                        domainObjectId: $domainObjectId
                    })
                    WITH c
                    MATCH (b:Board {id: $boardId})
                    MATCH (d:DomainObject {id: $domainObjectId})
                    CREATE (c)-[:DISPLAYED_ON]->(b)
                    CREATE (c)-[:REPRESENTS]->(d)
                `, {
                    id: canvasItemId,
                    ...canvasProps,
                    boardId,
                    domainObjectId
                });
            }

            // Create relationships between domain objects
            for (const item of boardData.items) {
                if (!item.id) continue;

                const domainKey = `${item.type}:${item.instanceName}`;
                const fromDomainId = domainObjectMap.get(domainKey);
                if (!fromDomainId) continue;

                // Command -> Event (TRIGGERS)
                if (item.producesEventId) {
                    const targetItem = boardData.items.find(i => i.id === item.producesEventId);
                    if (targetItem) {
                        const targetKey = `${targetItem.type}:${targetItem.instanceName}`;
                        const toDomainId = domainObjectMap.get(targetKey);
                        if (toDomainId) {
                            await session.run(`
                                MATCH (from:DomainObject {id: $fromId})
                                MATCH (to:DomainObject {id: $toId})
                                MERGE (from)-[:TRIGGERS]->(to)
                            `, { fromId: fromDomainId, toId: toDomainId });
                        }
                    }
                }

                // Event -> Policy (ACTIVATES)
                if (item.connectedPolicies && Array.isArray(item.connectedPolicies)) {
                    for (const policyId of item.connectedPolicies) {
                        const policyItem = boardData.items.find(i => i.id === policyId);
                        if (policyItem) {
                            const policyKey = `${policyItem.type}:${policyItem.instanceName}`;
                            const policyDomainId = domainObjectMap.get(policyKey);
                            if (policyDomainId) {
                                await session.run(`
                                    MATCH (evt:DomainObject {id: $evtId})
                                    MATCH (policy:DomainObject {id: $policyId})
                                    MERGE (evt)-[:ACTIVATES]->(policy)
                                `, { evtId: fromDomainId, policyId: policyDomainId });
                            }
                        }
                    }
                }
            }

            // Handle connections
            if (Array.isArray(boardData.connections)) {
                for (const conn of boardData.connections) {
                    if (!conn.from || !conn.to) continue;

                    const fromItem = boardData.items.find(i => i.id === conn.from);
                    const toItem = boardData.items.find(i => i.id === conn.to);
                    if (!fromItem || !toItem) continue;

                    const fromKey = `${fromItem.type}:${fromItem.instanceName}`;
                    const toKey = `${toItem.type}:${toItem.instanceName}`;
                    const fromDomainId = domainObjectMap.get(fromKey);
                    const toDomainId = domainObjectMap.get(toKey);

                    if (fromDomainId && toDomainId) {
                        const relType = conn.type ? conn.type.toUpperCase().replace(/\s+/g, '_') : 'RELATED_TO';
                        await session.run(`
                            MATCH (from:DomainObject {id: $fromId})
                            MATCH (to:DomainObject {id: $toId})
                            MERGE (from)-[:${relType}]->(to)
                        `, { fromId: fromDomainId, toId: toDomainId });
                    }
                }
            }
        }

        console.log('[Migration] ✅ Migration completed successfully!');
        console.log(`[Migration] Created ${boundedContextMap.size} BoundedContexts`);
        console.log(`[Migration] Created ${domainObjectMap.size} DomainObjects`);

    } catch (error) {
        console.error('[Migration] ❌ Migration failed:', error);
        throw error;
    } finally {
        await session.close();
        await closeDriver();
    }
};

// Run if executed directly
if (require.main === module) {
    migrate();
}

module.exports = { migrate };
