const { getSession } = require('./neo4j');
const Y = require('yjs');

// Helper to convert Y.js types to JS objects
const yDocToJs = (doc) => {
    const items = doc.getArray('canvasItems').toJSON();
    const connections = doc.getArray('connections').toJSON();
    const boardType = doc.getText('boardType').toString();
    return { items, connections, boardType };
};

// Helper to sanitize properties for Neo4j (same as in migration script)
const sanitizeProps = (p) => {
    const sanitized = {};
    for (const [key, value] of Object.entries(p)) {
        if (value === null || value === undefined) continue;
        if (typeof value === 'object') {
            if (Array.isArray(value) && value.every(v => typeof v === 'string' || typeof v === 'number')) {
                sanitized[key] = value;
            } else {
                sanitized[key] = JSON.stringify(value);
            }
        } else {
            sanitized[key] = value;
        }
    }
    return sanitized;
};

exports.bindState = async (docName, ydoc) => {
    const session = getSession();
    try {
        console.log(`[Persistence] Loading board '${docName}' from Neo4j`);

        // 1. Fetch Board Info
        const boardResult = await session.run(`
            MATCH (b:Board {id: $id})
            RETURN b
        `, { id: docName });

        if (boardResult.records.length === 0) {
            console.log(`[Persistence] Board '${docName}' not found. Creating new empty board.`);
            // If board doesn't exist, we don't populate ydoc, it starts empty.
            // Or we could create the Board node here.
            await session.run(`
                MERGE (b:Board {id: $id})
                SET b.name = $id, b.type = 'Eventstorming', b.path = $id
            `, { id: docName });
            return;
        }

        const boardNode = boardResult.records[0].get('b').properties;
        const boardType = boardNode.type || 'Eventstorming';

        // 2. Fetch Items
        const itemsResult = await session.run(`
            MATCH (b:Board {id: $id})-[:CONTAINS]->(n)
            RETURN n, labels(n) as labels
        `, { id: docName });

        const items = itemsResult.records.map(record => {
            const node = record.get('n').properties;
            const labels = record.get('labels');
            const type = labels.find(l => l !== 'Board') || 'Unknown';

            const parsedNode = { ...node, type };
            for (const key in parsedNode) {
                if (typeof parsedNode[key] === 'string') {
                    try {
                        const val = parsedNode[key];
                        if ((val.startsWith('{') && val.endsWith('}')) || (val.startsWith('[') && val.endsWith(']'))) {
                            parsedNode[key] = JSON.parse(val);
                        }
                    } catch (e) { }
                }
            }
            return parsedNode;
        });

        // 3. Fetch Connections
        const connectionsResult = await session.run(`
            MATCH (b:Board {id: $id})-[:CONTAINS]->(source)
            MATCH (b)-[:CONTAINS]->(target)
            MATCH (source)-[r]->(target)
            WHERE NOT type(r) IN ['CONTAINS', 'HAS_DETAIL_VIEW'] 
            RETURN r, startNode(r).id as from, endNode(r).id as to, type(r) as type
        `, { id: docName });

        const connections = connectionsResult.records.map(record => {
            const rel = record.get('r').properties;
            return {
                ...rel,
                from: record.get('from'),
                to: record.get('to'),
                type: record.get('type')
            };
        });

        // 4. Populate Y.Doc
        ydoc.transact(() => {
            const yItems = ydoc.getArray('canvasItems');
            const yConnections = ydoc.getArray('connections');
            const yBoardType = ydoc.getText('boardType');

            if (yItems.length === 0 && yConnections.length === 0) {
                // Only populate if empty (initial load)
                // Or should we always overwrite? bindState is called once per session.
                // If multiple clients connect, y-websocket syncs them.
                // bindState is called when the *first* client connects to this docName.

                yBoardType.delete(0, yBoardType.length);
                yBoardType.insert(0, boardType);

                items.forEach(item => {
                    const yMap = new Y.Map();
                    for (const [key, val] of Object.entries(item)) {
                        // We need to handle nested objects for Y.js
                        // But store.ts toYMap handles it. Here we are manual.
                        // Let's keep it simple: if it's an object/array, wrap it.
                        // But wait, we just parsed JSON strings back to objects.
                        // Y.js Map supports setting objects (it wraps them?). No, we need to use Y.Map/Y.Array.
                        // Actually, Y.Map.set(key, value) works for primitives. For objects, we need nested types.
                        // Let's use a helper similar to store.ts
                        const setDeep = (map, k, v) => {
                            if (Array.isArray(v)) {
                                const arr = new Y.Array();
                                v.forEach(i => {
                                    if (typeof i === 'object') {
                                        const m = new Y.Map();
                                        for (const sk in i) setDeep(m, sk, i[sk]);
                                        arr.push([m]);
                                    } else {
                                        arr.push([i]);
                                    }
                                });
                                map.set(k, arr);
                            } else if (typeof v === 'object' && v !== null) {
                                const m = new Y.Map();
                                for (const sk in v) setDeep(m, sk, v[sk]);
                                map.set(k, m);
                            } else {
                                map.set(k, v);
                            }
                        };
                        setDeep(yMap, key, val);
                    }
                    yItems.push([yMap]);
                });

                connections.forEach(conn => {
                    const yMap = new Y.Map();
                    for (const [key, val] of Object.entries(conn)) {
                        yMap.set(key, val);
                    }
                    yConnections.push([yMap]);
                });
            }
        });

        console.log(`[Persistence] Loaded ${items.length} items and ${connections.length} connections for '${docName}'`);

    } catch (error) {
        console.error(`[Persistence] Error binding state for '${docName}':`, error);
    } finally {
        await session.close();
    }
};

exports.writeState = async (docName, ydoc) => {
    const session = getSession();
    try {
        const { items, connections, boardType } = yDocToJs(ydoc);
        console.log(`[Persistence] Persisting board '${docName}' (${items.length} items, ${connections.length} conns)`);

        // 1. Update Board Info
        await session.run(`
            MERGE (b:Board {id: $id})
            SET b.type = $type
        `, { id: docName, type: boardType });

        // 2. Sync Items
        // Strategy: 
        // - Get all existing item IDs for this board from DB
        // - Identify deleted items (in DB but not in YDoc) -> DETACH DELETE
        // - MERGE all items from YDoc

        const existingItemsResult = await session.run(`
            MATCH (b:Board {id: $id})-[:CONTAINS]->(n)
            RETURN n.id as id
        `, { id: docName });
        const existingItemIds = existingItemsResult.records.map(r => r.get('id'));
        const newItemIds = new Set(items.map(i => i.id));

        const itemsToDelete = existingItemIds.filter(id => !newItemIds.has(id));

        if (itemsToDelete.length > 0) {
            await session.run(`
                MATCH (b:Board {id: $boardId})-[:CONTAINS]->(n)
                WHERE n.id IN $ids
                DETACH DELETE n
            `, { boardId: docName, ids: itemsToDelete });
        }

        for (const item of items) {
            const label = item.type || 'Unknown';
            const { parent, children, connectedPolicies, producesEventId, linkedDiagram, ...props } = item;
            const sanitizedProps = sanitizeProps(props);

            await session.run(`
                MERGE (n:\`${label}\` {id: $id})
                SET n += $props, n.boardId = $boardId
                MERGE (b:Board {id: $boardId})
                MERGE (b)-[:CONTAINS]->(n)
            `, { id: item.id, props: sanitizedProps, boardId: docName });

            if (parent) {
                await session.run(`
                    MATCH (child {id: $childId}), (parent {id: $parentId})
                    MERGE (parent)-[:CONTAINS]->(child)
                `, { childId: item.id, parentId: parent });
            }
            // Note: We are not handling implicit relationships (triggers, listensTo) here for simplicity/performance
            // unless strictly needed for the graph logic. For visualization, CONTAINS and explicit connections are enough.
            // But for "Ontology", we SHOULD maintain them. 
            // Let's add them back if we want full graph power.
            if (item.producesEventId) {
                await session.run(`
                    MATCH (cmd {id: $cmdId}), (evt {id: $evtId})
                    MERGE (cmd)-[:TRIGGERS]->(evt)
                `, { cmdId: item.id, evtId: item.producesEventId });
            }
        }

        // 3. Sync Connections
        const existingConnsResult = await session.run(`
            MATCH (b:Board {id: $id})-[:CONTAINS]->(s)-[r]->(e)
            WHERE NOT type(r) IN ['CONTAINS', 'HAS_DETAIL_VIEW']
            RETURN r.id as id
        `, { id: docName });
        const existingConnIds = existingConnsResult.records.map(r => r.get('id')); // Note: r.id property might not exist if we didn't set it. 
        // In migration we set r.id. Y.js connections usually have IDs.

        const newConnIds = new Set(connections.map(c => c.id));
        const connsToDelete = existingConnIds.filter(id => !newConnIds.has(id));

        if (connsToDelete.length > 0) {
            await session.run(`
                MATCH (b:Board {id: $boardId})-[:CONTAINS]->(s)-[r]->(e)
                WHERE r.id IN $ids
                DELETE r
            `, { boardId: docName, ids: connsToDelete });
        }

        for (const conn of connections) {
            const relType = conn.type ? conn.type.toUpperCase().replace(/\s+/g, '_') : 'RELATED_TO';
            await session.run(`
                MATCH (a {id: $from}), (b {id: $to})
                MERGE (a)-[r:\`${relType}\`]->(b)
                SET r.id = $id
            `, { from: conn.from, to: conn.to, id: conn.id });
        }

    } catch (error) {
        console.error(`[Persistence] Error writing state for '${docName}':`, error);
    } finally {
        await session.close();
    }
};
