console.log(`--- RUNNING LATEST VERSION: ${new Date().toISOString()} ---`);

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const { WebSocketServer } = require('ws');
const { setupWSConnection, setPersistence } = require('y-websocket/bin/utils');
const { getSession } = require('./src/backend/neo4j');
const { v4: uuidv4 } = require('uuid');

const app = express();
const port = 3000;

// Middleware
app.disable('etag');
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// ===== REST API for Domain Objects =====

// Get single domain object
app.get('/api/domain/:id', async (req, res) => {
    const session = getSession();
    try {
        const result = await session.run(
            'MATCH (d:DomainObject {id: $id}) RETURN d',
            { id: req.params.id }
        );
        if (result.records.length === 0) {
            return res.status(404).json({ error: 'Domain object not found' });
        }
        res.json(result.records[0].get('d').properties);
    } catch (error) {
        console.error('Error fetching domain object:', error);
        res.status(500).json({ error: error.message });
    } finally {
        await session.close();
    }
});

// Get domain objects (with optional filters)
app.get('/api/domain', async (req, res) => {
    const session = getSession();
    const { type, contextId } = req.query;

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
        const objects = result.records.map(r => r.get('d').properties);
        res.json(objects);
    } catch (error) {
        console.error('Error fetching domain objects:', error);
        res.status(500).json({ error: error.message });
    } finally {
        await session.close();
    }
});

// Create domain object
app.post('/api/domain', async (req, res) => {
    const session = getSession();
    const { type, instanceName, description, properties, boundedContextId } = req.body;
    const id = uuidv4();

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
            id,
            type,
            instanceName,
            description: description || '',
            properties: properties || '{}'
        });

        if (boundedContextId) {
            await session.run(`
                MATCH (d:DomainObject {id: $id})
                MATCH (bc:BoundedContext {id: $contextId})
                CREATE (d)-[:BELONGS_TO]->(bc)
            `, { id, contextId: boundedContextId });
        }

        const result = await session.run(
            'MATCH (d:DomainObject {id: $id}) RETURN d',
            { id }
        );

        res.status(201).json(result.records[0].get('d').properties);
    } catch (error) {
        console.error('Error creating domain object:', error);
        res.status(500).json({ error: error.message });
    } finally {
        await session.close();
    }
});

// Update domain object
app.put('/api/domain/:id', async (req, res) => {
    const session = getSession();
    const { id } = req.params;
    const { instanceName, description, properties, boundedContextId } = req.body;

    try {
        await session.run(`
            MATCH (d:DomainObject {id: $id})
            SET d.instanceName = $instanceName,
                d.description = $description,
                d.properties = $properties
        `, {
            id,
            instanceName,
            description: description || '',
            properties: properties || '{}'
        });

        if (boundedContextId) {
            await session.run(`
                MATCH (d:DomainObject {id: $id})
                OPTIONAL MATCH (d)-[r:BELONGS_TO]->()
                DELETE r
                WITH d
                MATCH (bc:BoundedContext {id: $contextId})
                CREATE (d)-[:BELONGS_TO]->(bc)
            `, { id, contextId: boundedContextId });
        }

        const result = await session.run(
            'MATCH (d:DomainObject {id: $id}) RETURN d',
            { id }
        );

        res.json(result.records[0].get('d').properties);
    } catch (error) {
        console.error('Error updating domain object:', error);
        res.status(500).json({ error: error.message });
    } finally {
        await session.close();
    }
});

// Delete domain object
app.delete('/api/domain/:id', async (req, res) => {
    const session = getSession();
    try {
        await session.run(`
            MATCH (c:CanvasItem)-[:REPRESENTS]->(d:DomainObject {id: $id})
            DETACH DELETE c, d
        `, { id: req.params.id });
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting domain object:', error);
        res.status(500).json({ error: error.message });
    } finally {
        await session.close();
    }
});

// Get bounded contexts
app.get('/api/contexts', async (req, res) => {
    const session = getSession();
    try {
        const result = await session.run('MATCH (bc:BoundedContext) RETURN bc');
        const contexts = result.records.map(r => r.get('bc').properties);
        res.json(contexts);
    } catch (error) {
        console.error('Error fetching contexts:', error);
        res.status(500).json({ error: error.message });
    } finally {
        await session.close();
    }
});

// Get all boards (for board list)
app.get('/api/boards', async (req, res) => {
    const session = getSession();
    try {
        const result = await session.run('MATCH (b:Board) RETURN b ORDER BY b.name');
        const boards = result.records.map(r => {
            const props = r.get('b').properties;
            return {
                id: props.id,
                boardId: props.id, // Compatibility
                name: props.name,
                type: props.boardType,
                boardType: props.boardType,
                instanceName: props.name,
                path: props.path,
            };
        });
        res.json(boards);
    } catch (error) {
        console.error('Error fetching boards:', error);
        res.status(500).json({ error: error.message });
    } finally {
        await session.close();
    }
});

// Get a single board by ID
app.get('/api/boards/:id', async (req, res) => {
    const session = getSession();
    try {
        const result = await session.run(
            'MATCH (b:Board {id: $id}) RETURN b',
            { id: req.params.id }
        );
        if (result.records.length === 0) {
            return res.status(404).json({ error: 'Board not found' });
        }
        const props = result.records[0].get('b').properties;
        res.json({
            id: props.id,
            boardId: props.id, // Compatibility
            name: props.name,
            type: props.boardType,
            boardType: props.boardType,
            instanceName: props.name,
            path: props.path,
            status: 'ok',
            api: `http://localhost:${port}/api`,
            websocket: `ws://localhost:${port}`
        });
    } catch (error) {
        console.error('Error fetching board:', error);
        res.status(500).json({ error: error.message });
    } finally {
        await session.close();
    }
});

// Update board (Snapshot, Name, etc.)
app.put('/api/boards/:id', async (req, res) => {
    const session = getSession();
    const { id } = req.params;
    const { snapshot, name, instanceName } = req.body;

    try {
        await session.run(`
            MATCH (b:Board {id: $id})
            SET b.snapshotUrl = $snapshot,
                b.name = COALESCE($name, b.name),
                b.updatedAt = datetime()
            RETURN b
        `, { id, snapshot, name: name || instanceName });

        res.json({ success: true });
    } catch (error) {
        console.error('Error updating board:', error);
        res.status(500).json({ error: error.message });
    } finally {
        await session.close();
    }
});

// Create Empty Board
app.post('/api/boards/create-empty', async (req, res) => {
    const session = getSession();
    const { name, boardType, path: folderPath } = req.body;
    const id = uuidv4();
    const finalName = name || 'New Board';
    // Use folderPath if provided, otherwise default to root (empty string or just the ID)
    const path = folderPath ? `${folderPath}/${id}.json` : `${id}.json`;

    try {
        await session.run(`
            CREATE (b:Board {
                id: $id,
                name: $name,
                boardType: $boardType,
                path: $path,
                createdAt: datetime(),
                updatedAt: datetime()
            })
            RETURN b
        `, {
            id,
            name: finalName,
            boardType: boardType || 'Eventstorming',
            path
        });

        res.json({
            id,
            boardId: id,
            name: finalName,
            boardType: boardType || 'Eventstorming',
            path
        });
    } catch (error) {
        console.error('Error creating board:', error);
        res.status(500).json({ error: error.message });
    } finally {
        await session.close();
    }
});

// Create Canvas Item (for Agent)
app.post('/api/canvas-items', async (req, res) => {
    const session = getSession();
    const { boardId, x, y, width, height, domainObjectId } = req.body;
    const id = uuidv4();

    try {
        // 1. Save to Neo4j directly
        await session.run(`
            MATCH (b:Board {id: $boardId})
            MATCH (d:DomainObject {id: $domainObjectId})
            CREATE (c:CanvasItem {
                id: $id,
                x: $x,
                y: $y,
                width: $width,
                height: $height,
                rotation: 0,
                boardId: $boardId,
                domainObjectId: $domainObjectId
            })
            CREATE (c)-[:DISPLAYED_ON]->(b)
            CREATE (c)-[:REPRESENTS]->(d)
            RETURN c
        `, { id, boardId, x, y, width, height, domainObjectId });

        res.status(201).json({ id, x, y, width, height, domainObjectId });
    } catch (error) {
        console.error('Error creating canvas item:', error);
        res.status(500).json({ error: error.message });
    } finally {
        await session.close();
    }
});

// Get all UML boards
app.get('/api/uml-boards', async (req, res) => {
    const session = getSession();
    try {
        const result = await session.run("MATCH (b:Board {boardType: 'UML'}) RETURN b ORDER BY b.updatedAt DESC");
        const boards = result.records.map(r => {
            const props = r.get('b').properties;
            return {
                id: props.id,
                name: props.name,
                boardType: props.boardType,
                updatedAt: props.updatedAt
            };
        });
        res.json(boards);
    } catch (error) {
        console.error('Error fetching UML boards:', error);
        res.status(500).json({ error: error.message });
    } finally {
        await session.close();
    }
});

// ===== Y-WebSocket Server Setup =====
const httpServer = http.createServer(app);
const wss = new WebSocketServer({ server: httpServer });

// Y.js Persistence with Neo4j V2
const neo4jPersistence = require('./src/backend/neo4j-persistence-v2');
setPersistence({
    bindState: neo4jPersistence.bindState,
    writeState: neo4jPersistence.writeState
});

wss.on('connection', (conn, req) => {
    setupWSConnection(conn, req, { gc: true });
});

// Start server
httpServer.listen(port, () => {
    console.log(`✅ Server listening at http://localhost:${port}`);
    console.log(`📊 REST API endpoint: http://localhost:${port}/api`);
    console.log(`🔌 WebSocket endpoint: ws://localhost:${port}`);
    console.log(`\nAvailable endpoints:`);
    console.log(`  GET    /api/domain/:id`);
    console.log(`  GET    /api/domain?type=EVENT`);
    console.log(`  POST   /api/domain`);
    console.log(`  PUT    /api/domain/:id`);
    console.log(`  DELETE /api/domain/:id`);
    console.log(`  GET    /api/contexts`);
    console.log(`  GET    /api/boards`);
    console.log(`  GET    /api/boards/:id`);
    console.log(`  GET    /api/uml-boards`);
    console.log(`  POST   /api/boards/create-empty`);
    console.log(`  POST   /api/canvas-items`);
});