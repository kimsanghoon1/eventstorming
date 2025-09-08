const express = require('express');
const cors = require('cors');
const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
const http = require('http');
const { WebSocketServer } = require('ws');
const Y = require('yjs');
const syncProtocol = require('y-protocols/sync');
const awarenessProtocol = require('y-protocols/awareness');
const encoding = require('lib0/encoding');
const decoding = require('lib0/decoding');
const debounce = require('lodash.debounce');
const axios = require('axios');
const archiver = require('archiver');

const app = express();
const port = 3000;

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir);
}

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// --- Y.js WebSocket Server Setup ---

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const docs = new Map();

const messageSync = 0;
const messageAwareness = 1;

const debouncedSave = debounce((doc) => {
    const filePath = path.join(dataDir, `${doc.name}.json`);
    const yItems = doc.getArray('canvasItems');
    const yConnections = doc.getArray('connections');
    const yBoardType = doc.getText('boardType');
    const boardData = {
        items: yItems.toJSON(),
        connections: yConnections.toJSON(),
        boardType: yBoardType.toString(),
    };
    fs.writeFile(filePath, JSON.stringify(boardData, null, 2), err => {
        if (err) {
            console.error('Error saving board:', err);
        }
    });
}, 2000);

const getDoc = (docname, gc = true) => {
  let doc = docs.get(docname);
  if (doc === undefined) {
    doc = new Y.Doc();
    doc.gc = gc;
    doc.name = docname;

    const filePath = path.join(dataDir, `${docname}.json`);
    if (fs.existsSync(filePath)) {
      try {
        const fileContent = fs.readFileSync(filePath, 'utf8');
        if (fileContent) {
            const boardData = JSON.parse(fileContent);
            const yItems = doc.getArray('canvasItems');
            const yConnections = doc.getArray('connections');
            const yBoardType = doc.getText('boardType');
            
            doc.transact(() => {
              if (boardData.boardType) {
                yBoardType.insert(0, boardData.boardType);
              }
              (boardData.items || []).forEach(item => yItems.push([new Y.Map(Object.entries(item))]));
              (boardData.connections || []).forEach(conn => yConnections.push([new Y.Map(Object.entries(conn))]));
            });
        }
      } catch (e) {
        console.error('Error parsing board data on load:', e);
      }
    }

    doc.on('update', (update, origin) => {
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, messageSync);
        syncProtocol.writeUpdate(encoder, update);
        const message = encoding.toUint8Array(encoder);
        
        doc.conns.forEach((_, conn) => {
            if (conn !== origin) {
                conn.send(message);
            }
        });
    });

    doc.on('update', () => debouncedSave(doc));
    docs.set(docname, doc);
  }
  return doc;
};

const setupWSConnection = (conn, req) => {
    conn.binaryType = 'arraybuffer';
    const url = new URL(req.url, `http://${req.headers.host}`);
    const docName = url.searchParams.get('room');

    if (!docName) {
        conn.close();
        return;
    }

    const doc = getDoc(docName);
    doc.conns = doc.conns || new Map();
    doc.conns.set(conn, new Set());

    const awareness = doc.awareness || (doc.awareness = new awarenessProtocol.Awareness(doc));

    conn.on('message', message => {
        try {
            const encoder = encoding.createEncoder();
            const decoder = decoding.createDecoder(new Uint8Array(message));
            const messageType = decoding.readVarUint(decoder);

            switch (messageType) {
                case messageSync:
                    encoding.writeVarUint(encoder, messageSync);
                    syncProtocol.readSyncMessage(decoder, encoder, doc, conn);
                    if (encoding.length(encoder) > 1) {
                        conn.send(encoding.toUint8Array(encoder));
                    }
                    break;
                case messageAwareness:
                    awarenessProtocol.applyAwarenessUpdate(awareness, decoding.readVarUint8Array(decoder), conn);
                    break;
            }
        } catch (err) {
            console.error(err);
            conn.close();
        }
    });

    const awarenessUpdateHandler = ({ added, updated, removed }, origin) => {
        const changedClients = added.concat(updated, removed);
        if (origin !== conn) {
            const encoder = encoding.createEncoder();
            encoding.writeVarUint(encoder, messageAwareness);
            encoding.writeVarUint8Array(encoder, awarenessProtocol.encodeAwarenessUpdate(awareness, changedClients));
            conn.send(encoding.toUint8Array(encoder));
        }
    };

    awareness.on('update', awarenessUpdateHandler);

    conn.on('close', () => {
        awareness.off('update', awarenessUpdateHandler);
        doc.conns.delete(conn);
    });

    // Send initial state
    const syncEncoder = encoding.createEncoder();
    encoding.writeVarUint(syncEncoder, messageSync);
    syncProtocol.writeSyncStep1(syncEncoder, doc);
    conn.send(encoding.toUint8Array(syncEncoder));

    const awarenessEncoder = encoding.createEncoder();
    encoding.writeVarUint(awarenessEncoder, messageAwareness);
    encoding.writeVarUint8Array(awarenessEncoder, awarenessProtocol.encodeAwarenessUpdate(awareness, Array.from(awareness.getStates().keys())));
    conn.send(encoding.toUint8Array(awarenessEncoder));
};

wss.on('connection', setupWSConnection);

// --- API Endpoints ---

app.get('/api/boards', async (req, res) => {
  try {
    const files = await fsp.readdir(dataDir);
    const jsonFiles = files.filter(file => file.endsWith('.json'));

    const boardPromises = jsonFiles.map(async (file) => {
        const filePath = path.join(dataDir, file);
        try {
            const fileContent = await fsp.readFile(filePath, 'utf8');
            if (fileContent.trim() === '') return null;
            const boardData = JSON.parse(fileContent);
            return {
                name: file.replace('.json', ''),
                type: boardData.boardType || 'Eventstorming'
            };
        } catch (e) {
            console.error(`Error processing board file ${file}:`, e);
            return null;
        }
    });

    const results = await Promise.all(boardPromises);
    const boards = results.filter(b => b !== null);
    res.status(200).json(boards);
  } catch (err) {
      console.error('Error in /api/boards:', err);
      res.status(500).send('Error reading boards directory');
  }
});

app.get('/api/boards/:name', (req, res) => {
  const boardName = req.params.name;
  const filePath = path.join(dataDir, `${boardName}.json`);

  fs.readFile(filePath, 'utf8', (err, data) => {
    if (err) {
      if (err.code === 'ENOENT') {
        return res.status(200).json({ items: [], connections: [], boardType: 'Eventstorming' });
      }
      return res.status(500).send('Error loading board');
    }
    res.status(200).json(JSON.parse(data));
  });
});

app.post('/api/boards/:name', (req, res) => {
  const boardName = req.params.name;
  const filePath = path.join(dataDir, `${boardName}.json`);
  const data = req.body;

  fs.writeFile(filePath, JSON.stringify(data, null, 2), (err) => {
    if (err) {
      return res.status(500).send('Error saving board');
    }
    getDoc(boardName); 
    res.status(200).send('Board saved successfully');
  });
});

app.delete('/api/boards/:name', (req, res) => {
  const boardName = req.params.name;
  const filePath = path.join(dataDir, `${boardName}.json`);

  fs.unlink(filePath, (err) => {
    if (err) {
      return res.status(500).send('Error deleting board');
    }
    const doc = docs.get(boardName);
    if (doc) {
      doc.destroy();
      docs.delete(boardName);
    }
    res.status(200).send('Board deleted successfully');
  });
});

// --- New Code Generation Endpoint ---

app.post('/api/generate-code', async (req, res) => {
  const { modelData, apiKey } = req.body;

  if (!modelData || !apiKey) {
    return res.status(400).send('Model data and API key are required.');
  }

  const secretPrompt = `
You are an expert software architect specializing in Domain-Driven Design and Clean Architecture. Your task is to generate a complete, runnable source code project based on the domain model provided below.

The domain model is described using a simplified JSON format that represents elements from EventStorming and UML diagrams.

**Instructions:**
1.  Analyze the provided JSON model which includes canvas items (like Aggregates, Commands, Events, Policies, Actors, ReadModels, and UML Classes/Interfaces) and their connections.
2.  Interpret the relationships between these elements to understand the business logic and system workflow.
3.  Generate a full source code project that implements the described domain model.
4.  The architecture of the generated code must strictly follow the principles of Clean Architecture. Organize the code into clear layers: Domain, Application, Infrastructure, and Presentation/API.
5.  The final output must be a single, valid JSON object. This JSON object should have file paths as keys (e.g., 'src/domain/product.js') and the corresponding code as string values.
6.  Do not include any text, explanation, or markdown formatting before or after the JSON object. The entire response must be only the JSON object itself.

**Domain Model (JSON):**
${JSON.stringify(modelData, null, 2)}
`;

  try {
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`,
      {
        contents: [
          {
            parts: [
              { text: secretPrompt },
            ],
          },
        ],
      }
    );

    const content = response.data.candidates[0].content.parts[0].text;
    const cleanedContent = content.replace(/^```json\n|```$/g, '');
    const files = JSON.parse(cleanedContent);

    const archive = archiver('zip', {
      zlib: { level: 9 },
    });

    res.attachment('generated-code.zip');
    archive.pipe(res);

    for (const filePath in files) {
      if (typeof files[filePath] === 'string') {
        archive.append(files[filePath], { name: filePath });
      }
    }

    await archive.finalize();

  } catch (error) {
    console.error('Error generating code:', error.response ? error.response.data : error.message);
    res.status(500).send('Failed to generate code. Check the API key and prompt.');
  }
});


server.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});
