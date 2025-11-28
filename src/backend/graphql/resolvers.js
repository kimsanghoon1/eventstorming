const { getSession } = require('../neo4j');

/**
 * GraphQL Resolvers for CanvasData Separation Architecture
 */

const resolvers = {
    Query: {
        // Board queries
        board: async (_, { id }) => {
            const session = getSession();
            try {
                const result = await session.run(`
                    MATCH (b:Board {id: $id})
                    RETURN b
                `, { id });

                if (result.records.length === 0) return null;
                return result.records[0].get('b').properties;
            } finally {
                await session.close();
            }
        },

        boards: async (_, { type }) => {
            const session = getSession();
            try {
                const query = type
                    ? 'MATCH (b:Board {boardType: $type}) RETURN b'
                    : 'MATCH (b:Board) RETURN b';

                const result = await session.run(query, type ? { type } : {});
                return result.records.map(r => r.get('b').properties);
            } finally {
                await session.close();
            }
        },

        // DomainObject queries
        domainObject: async (_, { id }) => {
            const session = getSession();
            try {
                const result = await session.run(`
                    MATCH (d:DomainObject {id: $id})
                    RETURN d
                `, { id });

                if (result.records.length === 0) return null;
                const props = result.records[0].get('d').properties;

                // Parse JSON properties
                if (props.properties) {
                    try {
                        props.propertiesObj = JSON.parse(props.properties);
                    } catch (e) { }
                }

                return props;
            } finally {
                await session.close();
            }
        },

        domainObjects: async (_, { type, contextId }) => {
            const session = getSession();
            try {
                let query = 'MATCH (d:DomainObject)';
                const params = {};

                if (type) {
                    query += ' WHERE d.type = $type';
                    params.type = type;
                }

                if (contextId) {
                    query += type ? ' AND' : ' WHERE';
                    query += ' (d)-[:BELONGS_TO]->(:BoundedContext {id: $contextId})';
                    params.contextId = contextId;
                }

                query += ' RETURN d';

                const result = await session.run(query, params);
                return result.records.map(r => {
                    const props = r.get('d').properties;
                    if (props.properties) {
                        try {
                            props.propertiesObj = JSON.parse(props.properties);
                        } catch (e) { }
                    }
                    return props;
                });
            } finally {
                await session.close();
            }
        },

        // BoundedContext queries
        boundedContext: async (_, { id }) => {
            const session = getSession();
            try {
                const result = await session.run(`
                    MATCH (bc:BoundedContext {id: $id})
                    RETURN bc
                `, { id });

                if (result.records.length === 0) return null;
                return result.records[0].get('bc').properties;
            } finally {
                await session.close();
            }
        },

        boundedContexts: async () => {
            const session = getSession();
            try {
                const result = await session.run('MATCH (bc:BoundedContext) RETURN bc');
                return result.records.map(r => r.get('bc').properties);
            } finally {
                await session.close();
            }
        },

        // UML queries
        umlClass: async (_, { id }) => {
            const session = getSession();
            try {
                const result = await session.run(`
                    MATCH (cls:UMLClass {id: $id})
                    RETURN cls
                `, { id });

                if (result.records.length === 0) return null;
                return result.records[0].get('cls').properties;
            } finally {
                await session.close();
            }
        },

        umlClasses: async (_, { boardId }) => {
            const session = getSession();
            try {
                const query = boardId
                    ? `MATCH (uc:UMLCanvasItem {boardId: $boardId})-[:REPRESENTS]->(cls:UMLClass) RETURN DISTINCT cls`
                    : 'MATCH (cls:UMLClass) RETURN cls';

                const result = await session.run(query, boardId ? { boardId } : {});
                return result.records.map(r => r.get('cls').properties);
            } finally {
                await session.close();
            }
        },
    },

    Mutation: {
        // CanvasItem mutations
        updateCanvasItemPosition: async (_, { id, input }) => {
            const session = getSession();
            try {
                await session.run(`
                    MATCH (c:CanvasItem {id: $id})
                    SET c.x = $x, c.y = $y, c.width = $width, c.height = $height, c.rotation = $rotation
                `, { id, ...input });

                const result = await session.run(`
                    MATCH (c:CanvasItem {id: $id})
                    RETURN c
                `, { id });

                return result.records[0].get('c').properties;
            } finally {
                await session.close();
            }
        },

        createCanvasItem: async (_, { boardId, domainObjectId, input }) => {
            const session = getSession();
            const { v4: uuidv4 } = require('uuid');
            const canvasItemId = uuidv4();

            try {
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
                    ...input,
                    boardId,
                    domainObjectId
                });

                const result = await session.run(`
                    MATCH (c:CanvasItem {id: $id})
                    RETURN c
                `, { id: canvasItemId });

                return result.records[0].get('c').properties;
            } finally {
                await session.close();
            }
        },

        deleteCanvasItem: async (_, { id }) => {
            const session = getSession();
            try {
                await session.run(`
                    MATCH (c:CanvasItem {id: $id})
                    DETACH DELETE c
                `, { id });
                return true;
            } finally {
                await session.close();
            }
        },

        // DomainObject mutations
        createDomainObject: async (_, { input }) => {
            const session = getSession();
            const { v4: uuidv4 } = require('uuid');
            const domainObjectId = uuidv4();

            try {
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
                    type: input.type,
                    instanceName: input.instanceName,
                    description: input.description || '',
                    properties: input.properties || '{}'
                });

                // Link to BoundedContext if provided
                if (input.boundedContextId) {
                    await session.run(`
                        MATCH (d:DomainObject {id: $domainId})
                        MATCH (bc:BoundedContext {id: $contextId})
                        CREATE (d)-[:BELONGS_TO]->(bc)
                    `, { domainId: domainObjectId, contextId: input.boundedContextId });
                }

                const result = await session.run(`
                    MATCH (d:DomainObject {id: $id})
                    RETURN d
                `, { id: domainObjectId });

                return result.records[0].get('d').properties;
            } finally {
                await session.close();
            }
        },

        updateDomainObject: async (_, { id, input }) => {
            const session = getSession();
            try {
                await session.run(`
                    MATCH (d:DomainObject {id: $id})
                    SET d.instanceName = $instanceName,
                        d.description = $description,
                        d.properties = $properties
                `, {
                    id,
                    instanceName: input.instanceName,
                    description: input.description || '',
                    properties: input.properties || '{}'
                });

                // Update context relationship if changed
                if (input.boundedContextId) {
                    await session.run(`
                        MATCH (d:DomainObject {id: $id})
                        OPTIONAL MATCH (d)-[r:BELONGS_TO]->()
                        DELETE r
                        WITH d
                        MATCH (bc:BoundedContext {id: $contextId})
                        CREATE (d)-[:BELONGS_TO]->(bc)
                    `, { id, contextId: input.boundedContextId });
                }

                const result = await session.run(`
                    MATCH (d:DomainObject {id: $id})
                    RETURN d
                `, { id });

                return result.records[0].get('d').properties;
            } finally {
                await session.close();
            }
        },

        deleteDomainObject: async (_, { id }) => {
            const session = getSession();
            try {
                // Also delete associated canvas items
                await session.run(`
                    MATCH (c:CanvasItem)-[:REPRESENTS]->(d:DomainObject {id: $id})
                    DETACH DELETE c, d
                `, { id });
                return true;
            } finally {
                await session.close();
            }
        },

        linkDomainObjects: async (_, { fromId, toId, relationType }) => {
            const session = getSession();
            try {
                await session.run(`
                    MATCH (from:DomainObject {id: $fromId})
                    MATCH (to:DomainObject {id: $toId})
                    MERGE (from)-[:${relationType}]->(to)
                `, { fromId, toId });
                return true;
            } finally {
                await session.close();
            }
        },

        // BoundedContext mutations
        createBoundedContext: async (_, { input }) => {
            const session = getSession();
            const { v4: uuidv4 } = require('uuid');
            const contextId = uuidv4();

            try {
                await session.run(`
                    CREATE (bc:BoundedContext {
                        id: $id,
                        name: $name,
                        description: $description
                    })
                `, {
                    id: contextId,
                    name: input.name,
                    description: input.description || ''
                });

                const result = await session.run(`
                    MATCH (bc:BoundedContext {id: $id})
                    RETURN bc
                `, { id: contextId });

                return result.records[0].get('bc').properties;
            } finally {
                await session.close();
            }
        },

        updateBoundedContext: async (_, { id, input }) => {
            const session = getSession();
            try {
                await session.run(`
                    MATCH (bc:BoundedContext {id: $id})
                    SET bc.name = $name, bc.description = $description
                `, {
                    id,
                    name: input.name,
                    description: input.description || ''
                });

                const result = await session.run(`
                    MATCH (bc:BoundedContext {id: $id})
                    RETURN bc
                `, { id });

                return result.records[0].get('bc').properties;
            } finally {
                await session.close();
            }
        },

        deleteBoundedContext: async (_, { id }) => {
            const session = getSession();
            try {
                await session.run(`
                    MATCH (bc:BoundedContext {id: $id})
                    DETACH DELETE bc
                `, { id });
                return true;
            } finally {
                await session.close();
            }
        },
    },

    // Field resolvers
    CanvasItem: {
        domainObject: async (parent) => {
            const session = getSession();
            try {
                const result = await session.run(`
                    MATCH (c:CanvasItem {id: $id})-[:REPRESENTS]->(d:DomainObject)
                    RETURN d
                `, { id: parent.id });

                if (result.records.length === 0) return null;
                return result.records[0].get('d').properties;
            } finally {
                await session.close();
            }
        },

        board: async (parent) => {
            const session = getSession();
            try {
                const result = await session.run(`
                    MATCH (c:CanvasItem {id: $id})-[:DISPLAYED_ON]->(b:Board)
                    RETURN b
                `, { id: parent.id });

                if (result.records.length === 0) return null;
                return result.records[0].get('b').properties;
            } finally {
                await session.close();
            }
        },
    },

    DomainObject: {
        boundedContext: async (parent) => {
            const session = getSession();
            try {
                const result = await session.run(`
                    MATCH (d:DomainObject {id: $id})-[:BELONGS_TO]->(bc:BoundedContext)
                    RETURN bc
                `, { id: parent.id });

                if (result.records.length === 0) return null;
                return result.records[0].get('bc').properties;
            } finally {
                await session.close();
            }
        },

        canvasItems: async (parent) => {
            const session = getSession();
            try {
                const result = await session.run(`
                    MATCH (c:CanvasItem)-[:REPRESENTS]->(d:DomainObject {id: $id})
                    RETURN c
                `, { id: parent.id });

                return result.records.map(r => r.get('c').properties);
            } finally {
                await session.close();
            }
        },
    },

    BoundedContext: {
        domainObjects: async (parent) => {
            const session = getSession();
            try {
                const result = await session.run(`
                    MATCH (d:DomainObject)-[:BELONGS_TO]->(bc:BoundedContext {id: $id})
                    RETURN d
                `, { id: parent.id });

                return result.records.map(r => r.get('d').properties);
            } finally {
                await session.close();
            }
        },
    },

    Board: {
        canvasItems: async (parent) => {
            const session = getSession();
            try {
                const result = await session.run(`
                    MATCH (c:CanvasItem)-[:DISPLAYED_ON]->(b:Board {id: $id})
                    RETURN c
                `, { id: parent.id });

                return result.records.map(r => r.get('c').properties);
            } finally {
                await session.close();
            }
        },

        umlCanvasItems: async (parent) => {
            const session = getSession();
            try {
                const result = await session.run(`
                    MATCH (uc:UMLCanvasItem {boardId: $id})
                    RETURN uc
                `, { id: parent.id });

                return result.records.map(r => r.get('uc').properties);
            } finally {
                await session.close();
            }
        },
    },
};

module.exports = resolvers;
