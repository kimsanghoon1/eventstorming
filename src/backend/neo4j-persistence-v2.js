const { getSession } = require('./neo4j');
const Y = require('yjs');

/**
 * Neo4j Persistence for Y.js - Canvas Only
 * 
 * Canvas 위치 정보만 Y.js로 관리
 * Domain 정보는 GraphQL로 관리
 */

exports.bindState = async (docName, ydoc) => {
    const session = getSession();
    try {
        console.log(`[Persistence V2] Loading board '${docName}' from Neo4j`);

        // Fetch CanvasItems for this board
        const result = await session.run(`
            MATCH (c:CanvasItem {boardId: $boardId})
            RETURN c
        `, { boardId: docName });

        const canvasItems = result.records.map(record => {
            const props = record.get('c').properties;
            return {
                id: props.id,
                x: props.x,
                y: props.y,
                width: props.width,
                height: props.height,
                rotation: props.rotation || 0,
                domainObjectId: props.domainObjectId
            };
        });

        // Populate Y.Doc with canvas items only
        ydoc.transact(() => {
            const yItems = ydoc.getArray('canvasItems');

            if (yItems.length === 0 && canvasItems.length > 0) {
                canvasItems.forEach(item => {
                    const yMap = new Y.Map();
                    for (const [key, val] of Object.entries(item)) {
                        yMap.set(key, val);
                    }
                    yItems.push([yMap]);
                });
            }
        });

        console.log(`[Persistence V2] Loaded ${canvasItems.length} canvas items for '${docName}'`);

    } catch (error) {
        console.error(`[Persistence V2] Error binding state for '${docName}':`, error);
    } finally {
        await session.close();
    }
};

exports.writeState = async (docName, ydoc) => {
    const session = getSession();
    try {
        const yItems = ydoc.getArray('canvasItems');
        const canvasItems = yItems.toJSON();

        console.log(`[Persistence V2] Persisting ${canvasItems.length} canvas items for '${docName}'`);

        // Get existing canvas items for this board
        const existingResult = await session.run(`
            MATCH (c:CanvasItem {boardId: $boardId})
            RETURN c.id as id
        `, { boardId: docName });
        const existingIds = existingResult.records.map(r => r.get('id'));
        const newIds = new Set(canvasItems.map(c => c.id));

        // Delete canvas items that are no longer in Y.js
        const idsToDelete = existingIds.filter(id => !newIds.has(id));
        if (idsToDelete.length > 0) {
            await session.run(`
                MATCH (c:CanvasItem {boardId: $boardId})
                WHERE c.id IN $ids
                DETACH DELETE c
            `, { boardId: docName, ids: idsToDelete });
        }

        // Update or create canvas items
        for (const item of canvasItems) {
            await session.run(`
                MERGE (c:CanvasItem {id: $id})
                SET c.x = $x,
                    c.y = $y,
                    c.width = $width,
                    c.height = $height,
                    c.rotation = $rotation,
                    c.boardId = $boardId,
                    c.domainObjectId = $domainObjectId
                WITH c
                MATCH (b:Board {id: $boardId})
                MERGE (c)-[:DISPLAYED_ON]->(b)
                WITH c
                MATCH (d:DomainObject {id: $domainObjectId})
                MERGE (c)-[:REPRESENTS]->(d)
            `, {
                id: item.id,
                x: item.x,
                y: item.y,
                width: item.width,
                height: item.height,
                rotation: item.rotation || 0,
                boardId: docName,
                domainObjectId: item.domainObjectId
            });
        }

    } catch (error) {
        console.error(`[Persistence V2] Error writing state for '${docName}':`, error);
    } finally {
        await session.close();
    }
};
