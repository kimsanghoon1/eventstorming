import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import http from 'http';
import { WebSocketServer } from 'ws';
import * as Y from 'yjs';
import { setupWSConnection, docs } from 'y-websocket/bin/utils.js';
import axios from 'axios';
import archiver from 'archiver';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

const debounce = (fn, delay) => {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
};

const getDoc = (docname, gc = true) => {
  const doc = docs.get(docname) || new Y.Doc();
  doc.gc = gc;
  
  if (!docs.has(docname)) {
    const filePath = path.join(dataDir, `${docname}.json`);
    
    if (fs.existsSync(filePath)) {
      try {
        const fileContent = fs.readFileSync(filePath, 'utf8');
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
      } catch (e) {
        console.error('Error parsing board data on load:', e);
      }
    }

    const saveDebounced = debounce(() => {
      const yItems = doc.getArray('canvasItems');
      const yConnections = doc.getArray('connections');
      const yBoardType = doc.getText('boardType');

      const boardData = {
        items: yItems.toJSON(),
        connections: yConnections.toJSON(),
        boardType: yBoardType.toString(),
      };

      fs.writeFile(filePath, JSON.stringify(boardData, null, 2), (err) => {
        if (err) {
          console.error('Error saving board:', err);
        }
      });
    }, 2000);

    doc.on('update', saveDebounced);
    docs.set(docname, doc);
  }
  return doc;
};

wss.on('connection', (conn, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const docName = url.searchParams.get('room');

  if (docName) {
    const doc = getDoc(docName);
    setupWSConnection(conn, req, { doc });
  } else {
    conn.close();
  }
});


// --- API Endpoints ---

app.get('/api/boards', (req, res) => {
  fs.readdir(dataDir, (err, files) => {
    if (err) {
      return res.status(500).send('Error reading boards directory');
    }
    const boardNames = files
      .filter(file => file.endsWith('.json'))
      .map(file => file.replace('.json', ''));
    res.status(200).json(boardNames);
  });
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
  const { prompt, apiKey } = req.body;

  if (!prompt || !apiKey) {
    return res.status(400).send('Prompt and API key are required.');
  }

  const fullPrompt = `
You are an expert software architect. Based on the following request, generate all the necessary files for the project. Your response must be a single, valid JSON object. This JSON object should have file paths as keys (e.g., 'src/index.js') and the corresponding code as string values.

Do not include any text, explanation, or markdown formatting before or after the JSON object. The entire response should be only the JSON object itself.

Request: "${prompt}"
`;

  try {
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`,
      {
        contents: [
          {
            parts: [
              { text: fullPrompt },
            ],
          },
        ],
      }
    );

    const content = response.data.candidates[0].content.parts[0].text;
    const cleanedContent = content.replace(/^\`\`\`json\n|\`\`\`$/g, '');
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
