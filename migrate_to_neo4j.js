const fs = require('fs').promises;
const path = require('path');
const { getSession, verifyConnection, closeDriver } = require('./src/backend/neo4j');

const baseDataDir = path.join(__dirname, 'data');

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

const migrate = async () => {
    const connected = await verifyConnection();
    if (!connected) {
        console.error('Neo4j not connected. Aborting migration.');
        process.exit(1);
    }

    const files = await getJsonFiles(baseDataDir);
    const session = getSession();

    try {
        console.log(`Found ${files.length} files to migrate.`);

        for (const file of files) {
            const content = await fs.readFile(file, 'utf8');
            if (!content.trim()) continue;

            const boardData = JSON.parse(content);
            const relativePath = path.relative(baseDataDir, file).replace(/\\/g, '/');
            const boardId = relativePath; // Use relative path as Board ID
            const boardType = boardData.boardType || 'Eventstorming';
            const boardName = boardData.instanceName || path.basename(file, '.json');

            console.log(`Migrating Board: ${boardName} (${boardType})`);

            // 1. Create Board Node
            await session.run(`
                MERGE (b:Board {id: $id})
                SET b.name = $name, b.type = $type, b.path = $path
            `, { id: boardId, name: boardName, type: boardType, path: relativePath });

            // 2. Create Items (Nodes)
            if (Array.isArray(boardData.items)) {
                for (const item of boardData.items) {
                    if (!item.id) continue;

                    // Determine Label based on type
                    const label = item.type || 'Unknown';

                    // Prepare properties (exclude relationships for now)
                    const { parent, children, connectedPolicies, producesEventId, linkedDiagram, ...props } = item;

                    // Helper to sanitize properties for Neo4j
                    const sanitizeProps = (p) => {
                        const sanitized = {};
                        for (const [key, value] of Object.entries(p)) {
                            if (value === null || value === undefined) continue;
                            if (typeof value === 'object') {
                                // Neo4j supports arrays of strings/numbers, but not arrays of objects
                                if (Array.isArray(value) && value.every(v => typeof v === 'string' || typeof v === 'number')) {
                                    sanitized[key] = value;
                                } else {
                                    // Stringify complex objects/arrays
                                    sanitized[key] = JSON.stringify(value);
                                }
                            } else {
                                sanitized[key] = value;
                            }
                        }
                        return sanitized;
                    };

                    const sanitizedProps = sanitizeProps(props);

                    await session.run(`
                        MERGE (n:\`${label}\` {id: $id})
                        SET n += $props, n.boardId = $boardId
                        MERGE (b:Board {id: $boardId})
                        MERGE (b)-[:CONTAINS]->(n)
                    `, {
                        id: item.id,
                        props: sanitizedProps,
                        boardId: boardId
                    });

                    // Handle Parent-Child Relationship (Containment)
                    if (parent) {
                        await session.run(`
                            MATCH (child {id: $childId}), (parent {id: $parentId})
                            MERGE (parent)-[:CONTAINS]->(child)
                        `, { childId: item.id, parentId: parent });
                    }

                    // Handle Linked Diagram
                    if (linkedDiagram) {
                        // linkedDiagram is a path, which is the ID of another Board
                        // We need to normalize it to match boardId format
                        let targetBoardId = linkedDiagram.replace(/^data\//, ''); // Strip 'data/' prefix if present

                        await session.run(`
                            MATCH (n {id: $itemId})
                            MERGE (b:Board {id: $targetBoardId})
                            MERGE (n)-[:HAS_DETAIL_VIEW]->(b)
                        `, { itemId: item.id, targetBoardId: targetBoardId });
                    }
                }
            }

            // 3. Create Connections (Relationships)
            if (Array.isArray(boardData.connections)) {
                for (const conn of boardData.connections) {
                    if (!conn.from || !conn.to) continue;

                    const relType = conn.type ? conn.type.toUpperCase().replace(/\s+/g, '_') : 'RELATED_TO';

                    await session.run(`
                        MATCH (a {id: $from}), (b {id: $to})
                        MERGE (a)-[r:\`${relType}\`]->(b)
                        SET r.id = $id
                    `, { from: conn.from, to: conn.to, id: conn.id || `conn_${conn.from}_${conn.to}` });
                }
            }

            // 4. Handle Implicit Relationships (producesEventId, etc.)
            if (Array.isArray(boardData.items)) {
                for (const item of boardData.items) {
                    if (item.producesEventId) {
                        await session.run(`
                            MATCH (cmd {id: $cmdId}), (evt {id: $evtId})
                            MERGE (cmd)-[:TRIGGERS]->(evt)
                        `, { cmdId: item.id, evtId: item.producesEventId });
                    }

                    if (item.connectedPolicies && Array.isArray(item.connectedPolicies)) {
                        for (const policyId of item.connectedPolicies) {
                            await session.run(`
                                MATCH (evt {id: $evtId}), (policy {id: $policyId})
                                MERGE (policy)-[:LISTENS_TO]->(evt)
                            `, { evtId: item.id, policyId: policyId });
                        }
                    }
                }
            }
        }

        console.log('Migration completed successfully.');
    } catch (error) {
        console.error('Migration failed:', error);
    } finally {
        await session.close();
        await closeDriver();
    }
};

migrate();
