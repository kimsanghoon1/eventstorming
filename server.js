console.log(`--- RUNNING LATEST VERSION: ${new Date().toISOString()} ---
`);

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
const http = require('http');
const { WebSocketServer } = require('ws');
const Y = require('yjs');
const { setupWSConnection } = require('y-websocket/bin/utils');
const chokidar = require('chokidar');
const axios = require('axios'); // For making HTTP requests to the orchestrator
const { v4: uuidv4 } = require('uuid'); // For generating UUIDs

const app = express();
const port = 3000;

const baseDataDir = path.join(__dirname, 'data');
const snapshotsDir = path.join(baseDataDir, 'snapshots');

// Ensure directories exist
[baseDataDir, snapshotsDir].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

app.disable('etag'); // Disable ETag generation to prevent 304 responses
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// --- In-memory cache for board data ---
const boardDataCache = {};

// --- File watcher to keep cache in sync ---
const updateCache = async (filePath) => {
    try {
        const instanceName = path.basename(filePath, '.json');
        console.log(`[Cache] Updating cache for: ${instanceName}`);
        const fileContent = await fsp.readFile(filePath, 'utf8');
        if (fileContent.trim() === '') {
            delete boardDataCache[instanceName];
            return;
        }
        const boardData = JSON.parse(fileContent);
        boardDataCache[instanceName] = boardData;
    } catch (e) {
        console.error(`[Cache] Error updating cache for ${filePath}:`, e);
    }
};

const removeFromCache = (filePath) => {
    const instanceName = path.basename(filePath, '.json');
    console.log(`[Cache] Removing from cache: ${instanceName}`);
    delete boardDataCache[instanceName];
};

const watcher = chokidar.watch([baseDataDir], {
    persistent: true,
    ignoreInitial: true, // Don't fire 'add' for existing files on startup
    ignored: (filePath) => path.basename(filePath) === 'snapshots' || filePath.includes(path.join(baseDataDir, 'snapshots')),
    awaitWriteFinish: { // Helps prevent reading incomplete files
        stabilityThreshold: 2000,
        pollInterval: 100
    }
});

watcher
    .on('add', updateCache)
    .on('change', updateCache)
    .on('unlink', removeFromCache)
    .on('ready', () => {
        console.log('[Watcher] Initial scan complete. Ready for changes.');
        // Pre-fill the cache with existing files
        const watchedPaths = watcher.getWatched();
        for (const dirPath in watchedPaths) {
            const files = watchedPaths[dirPath];
            files.forEach(fileName => {
                const fullPath = path.join(dirPath, fileName);
                // Ensure we only process files, not directories that might be listed
                if (fs.statSync(fullPath).isFile() && fullPath.endsWith('.json')) {
                    updateCache(fullPath);
                }
            });
        }
    });


// --- New endpoint to trigger the orchestrator ---
app.post('/api/create-model', async (req, res) => {
    const { prompt } = req.body;

    if (!prompt) {
        return res.status(400).json({ error: 'Prompt is required' });
    }

    const orchestratorUrl = "http://localhost:10007/"; // Orchestrator agent URL

    const payload = {
        "jsonrpc": "2.0",
        "id": uuidv4(),
        "method": "message/send",
        "params": {
            "message": {
                "role": "user",
                "parts": [{"kind": "text", "text": prompt, "content_type": "text/plain"}],
                "messageId": uuidv4().replace(/-/g, ''),
            },
            "skill": "orchestrate_modeling_workflow"
        }
    };

    try {
        console.log(`[Orchestrator] Forwarding request to ${orchestratorUrl} with prompt: "${prompt}"`);
        
        // Using a long timeout as the orchestration can take a while
        const response = await axios.post(orchestratorUrl, payload, { timeout: 600000 }); // 10 minute timeout

        if (response.status === 200 && response.data.result) {
            console.log('[Orchestrator] Request successful. Workflow completed.');
            // The result of the python script is file creation, so we just need to send success
            res.status(200).json({ message: 'Model creation process completed successfully.' });
        } else {
            console.error('[Orchestrator] Request failed or returned an error:', response.data);
            res.status(500).json({ error: 'Orchestrator did not return a successful result.', details: response.data });
        }
    } catch (error) {
        console.error('[Orchestrator] Error calling orchestrator agent:', error.message);
        if (error.response) {
            console.error('Error Response Body:', error.response.data);
        }
        res.status(500).json({ error: 'Failed to communicate with the orchestrator agent.', details: error.message });
    }
});


const server = http.createServer(app);
const wss = new WebSocketServer({ server });

wss.on('connection', setupWSConnection);

// --- API Endpoints for Persistence ---

// Helper to recursively find a board file path by its instanceName (filename without extension)
const findBoardFile = async (dir, fileName) => {
    const entries = await fsp.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === 'snapshots') continue;
            const found = await findBoardFile(fullPath, fileName);
            if (found) return found;
        } else if (entry.isFile() && entry.name === fileName) {
            console.log('found: ', fullPath);
            return fullPath;
        }
    }
    return null;
};

// Helper to find board path (replaces getBoardPath)
const getBoardPath = async (instanceName) => {
    // A. It could be a project name, in which case we look for the matching .json file inside that folder.
    const projectPath = path.join(baseDataDir, instanceName, `${instanceName}.json`);
    try {
        await fsp.access(projectPath);
        return projectPath;
    } catch (e) {
        // Not a project folder, continue to search globally.
    }

    // B. Fallback: It could be a direct lookup for a file by its name (e.g., a specific UML diagram).
    const fileName = `${instanceName}.json`;
    const foundPath = await findBoardFile(baseDataDir, fileName);
    if (foundPath) {
        return foundPath;
    }
    
    return null; // Return null if nothing is found
};

app.get('/api/boards', async (req, res) => {
  try {
    const relativePath = req.query.path || '';
    // Security: Prevent directory traversal
    const currentDir = path.resolve(baseDataDir, relativePath);
    if (!currentDir.startsWith(path.resolve(baseDataDir))) {
      return res.status(400).send('Invalid path');
    }

    const entries = await fsp.readdir(currentDir, { withFileTypes: true });
    const items = [];

    for (const entry of entries) {
      if (entry.name === 'snapshots') continue; // Skip snapshots directory

      const entryRelativePath = path.join(relativePath, entry.name);
      if (entry.isDirectory()) {
        items.push({
          name: entry.name,
          type: 'folder',
          path: entryRelativePath,
        });
      } else if (entry.isFile() && entry.name.endsWith('.json')) {
        try {
          const fullPath = path.join(currentDir, entry.name);
          const fileContent = await fsp.readFile(fullPath, 'utf8');
          if (fileContent.trim() === '') continue;
          
          const boardData = JSON.parse(fileContent);
          const stats = await fsp.stat(fullPath);
          const boardName = entry.name.replace('.json', '');

          // The unique ID for a board is its relative path, replacing backslashes for URL safety.
          const boardId = entryRelativePath.replace(/\\/g, '/');

          const snapshotPath = path.join(snapshotsDir, `${boardName}.png`);
          let snapshotUrl = null;
          try {
            await fsp.access(snapshotPath);
            snapshotUrl = `/api/snapshots/${boardName}`;
          } catch (e) { /* No snapshot exists */ }

          items.push({
            id: boardId,
            boardId: boardId, // Use this for API calls
            name: boardData.instanceName || boardName,
            type: boardData.boardType || 'Unknown',
            instanceName: boardData.instanceName || boardName,
            savedAt: stats.mtime,
            snapshotUrl: snapshotUrl,
          });
        } catch (e) {
          console.error(`Error processing board file ${entry.name}:`, e);
        }
      }
    }

    items.sort((a, b) => {
        if (a.type === 'folder' && b.type !== 'folder') return -1;
        if (a.type !== 'folder' && b.type === 'folder') return 1;
        return a.name.localeCompare(b.name);
    });
    
    res.status(200).json(items);

  } catch (err) {
      console.error('Error in /api/boards:', err);
      res.status(500).send('Error reading boards directory');
  }
});

// Endpoint to get only UML boards
app.get('/api/boards/uml', async (req, res) => {
  try {
    const files = await fsp.readdir(umlDir);
    const jsonFiles = files.filter(file => file.endsWith('.json'));

    const boardPromises = jsonFiles.map(async (file) => {
      const filePath = path.join(umlDir, file);
      try {
        const fileContent = await fsp.readFile(filePath, 'utf8');
        if (fileContent.trim() === '') return null;
        const boardData = JSON.parse(fileContent);
        if (boardData.boardType === 'UML') {
          const stats = await fsp.stat(filePath);
          return {
            name: file.replace('.json', ''),
            type: 'UML',
            savedAt: stats.mtime,
            snapshot: boardData.snapshot || null,
          };
        }
        return null;
      } catch (e) {
        console.error(`Error processing board file ${file}:`, e);
        return null;
      }
    });

    const results = await Promise.all(boardPromises);
    const umlBoards = results.filter(b => b !== null).sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));
    res.status(200).json(umlBoards);
  } catch (err) {
    console.error('Error in /api/boards/uml:', err);
    res.status(500).send('Error reading boards directory');
  }
});

// New endpoint to get a flat list of all UML boards for dropdowns
app.get('/api/uml-boards', async (req, res) => {
  try {
    const umlBoards = [];
    const files = await fsp.readdir(baseDataDir, { recursive: true, withFileTypes: true });

    for (const file of files) {
      if (file.isFile() && file.name.endsWith('.json')) {
        const filePath = path.join(file.path, file.name);
        try {
          const content = await fsp.readFile(filePath, 'utf-8');
          const boardData = JSON.parse(content);
          if (boardData.boardType === 'UML') {
            umlBoards.push({
              name: boardData.instanceName || file.name.replace('.json', ''),
              instanceName: boardData.instanceName || file.name.replace('.json', ''),
            });
          }
        } catch (e) {
          console.error(`Error reading or parsing ${filePath}:`, e);
          // ignore erroneous files
        }
      }
    }
    res.status(200).json(umlBoards);
  } catch (err) {
    console.error('Error fetching UML boards:', err);
    res.status(500).send('Error fetching UML boards');
  }
});

// Get the content of a specific board by its relative path (ID)
app.get('/api/boards/:boardId(*)', async (req, res) => {
  const boardId = req.params.boardId;
  const instanceName = path.basename(boardId, '.json');

  // 1. Try to get data from cache first
  // Note: Cache key might need adjustment if names are not unique across folders
  if (boardDataCache[instanceName]) {
    console.log(`[API] Serving '${instanceName}' from cache.`);
    const boardData = boardDataCache[instanceName];
    if (boardData.boardType === 'Eventstorming' && boardData.items) {
      await enrichEventstormingWithUML(boardData);
    }
    return res.status(200).json(boardData);
  }

  // 2. If not in cache, read from file
  console.log(`[API] Cache miss for '${instanceName}'. Reading from file.`);
  
  // Security: Prevent directory traversal
  const filePath = path.resolve(baseDataDir, boardId);
  if (!filePath.startsWith(path.resolve(baseDataDir))) {
    return res.status(400).send('Invalid board path');
  }

  try {
    const data = await fsp.readFile(filePath, 'utf8');
    const boardData = JSON.parse(data);
    boardDataCache[instanceName] = boardData; // Populate cache

    if (boardData.boardType === 'Eventstorming' && boardData.items) {
      await enrichEventstormingWithUML(boardData);
    }

    res.status(200).json(boardData);
  } catch (err) {
    if (err.code === 'ENOENT') {
      return res.status(404).send(`Board '${boardId}' not found.`);
    }
    console.error(`Error loading board ${boardId}:`, err);
    return res.status(500).send('Error loading board');
  }
});

// Helper function to keep enrichment logic DRY
const enrichEventstormingWithUML = async (boardData) => {
    if (!boardData.items) return; // Guard against missing items

    for (const item of boardData.items) {
        if (item.type === 'Aggregate' && item.linkedDiagram) {
            const linkedInstanceName = item.linkedDiagram;
            let umlBoard = boardDataCache[linkedInstanceName];

            // If linked UML is not in cache, read it from file
            if (!umlBoard) {
                // We must search for the file, as we only have the instanceName
                const umlFileName = `${linkedInstanceName}.json`;
                const umlFilePath = await findBoardFile(baseDataDir, umlFileName);

                if (umlFilePath) {
                    try {
                        console.log(`[Enrichment] Cache miss for linked UML '${linkedInstanceName}'. Reading from file: ${umlFilePath}`);
                        const umlData = await fsp.readFile(umlFilePath, 'utf8');
                        umlBoard = JSON.parse(umlData);
                        boardDataCache[linkedInstanceName] = umlBoard; // Add to cache
                    } catch (umlErr) {
                        console.error(`Could not read or parse linked diagram ${linkedInstanceName}:`, umlErr);
                        continue; // Continue to next item
                    }
                } else {
                    console.error(`Could not find linked diagram file: ${umlFileName}`);
                    continue;
                }
            } else {
                console.log(`[Enrichment] Found linked UML '${linkedInstanceName}' in cache.`);
            }
            
            if (umlBoard && umlBoard.items) {
                const aggregateClass = umlBoard.items.find(i => i.stereotype === 'AggregateRoot') || umlBoard.items.find(i => i.type === 'Class');
                if (aggregateClass && aggregateClass.attributes) {
                    item.attributes = aggregateClass.attributes;
                }
            }
        }
    }
};

// Save a board's content with snapshot (dynamic route, should be after specific routes)
app.post('/api/boards/:boardId(*)', async (req, res) => {
  const boardId = req.params.boardId;
  const { snapshot, ...boardData } = req.body;
  
  // Security: Prevent directory traversal
  const filePath = path.resolve(baseDataDir, boardId);
  if (!filePath.startsWith(path.resolve(baseDataDir))) {
    return res.status(400).send('Invalid board path');
  }

  const instanceName = path.basename(boardId, '.json');

  try {
    // Save the snapshot as a separate file
    if (snapshot && typeof snapshot === 'string') {
        const matches = snapshot.match(/^data:image\/(png|jpeg);base64,(.+)$/);
        if (matches) {
            const imageBuffer = Buffer.from(matches[2], 'base64');
            const snapshotPath = path.join(snapshotsDir, `${instanceName}.png`);
            await fsp.writeFile(snapshotPath, imageBuffer);
        }
    }
    
    // Save the board data (without snapshot)
    await fsp.writeFile(filePath, JSON.stringify(boardData, null, 2));
    res.status(200).send('Board saved successfully');
  } catch (err) {
    console.error(`Error saving board ${instanceName}:`, err);
    return res.status(500).send('Error saving board');
  }
});

app.post('/api/headless-save', async (req, res) => {
  const { boardName, boardData, boardType } = req.body;
  
  if (!boardName || !boardData || !boardType) {
    return res.status(400).send('Missing required fields for headless save.');
  }
  
  // For headless save, we need to decide on a path. We'll save it in a folder of its name.
  const projectDir = path.join(baseDataDir, boardName);
  await fsp.mkdir(projectDir, { recursive: true });
  const filePath = path.join(projectDir, `${boardName}.json`);

  const dataToSave = {
    ...boardData,
    boardType: boardType,
  };

  try {
    await fsp.writeFile(filePath, JSON.stringify(dataToSave, null, 2));
    res.status(200).send('Board saved successfully (headless)');
  } catch (err) {
    console.error(`Error saving board headless ${boardName}:`, err);
    return res.status(500).send('Error saving board');
  }
});

// Delete a board by its relative path (ID)
app.delete('/api/boards/:boardId(*)', async (req, res) => {
  const boardId = req.params.boardId;
  
  // Security: Prevent directory traversal
  const filePath = path.resolve(baseDataDir, boardId);
  if (!filePath.startsWith(path.resolve(baseDataDir))) {
    return res.status(400).send('Invalid board path');
  }

  try {
    // Delete the board json file
    await fsp.unlink(filePath);

    // Derive snapshot name from the actual file path
    const snapshotName = path.basename(filePath, '.json');
    const snapshotPath = path.join(snapshotsDir, `${snapshotName}.png`);
    
    try {
        await fsp.unlink(snapshotPath);
    } catch (snapshotErr) {
        if (snapshotErr.code !== 'ENOENT') { // Ignore error if snapshot doesn't exist
            console.error(`Could not delete snapshot for ${boardId}:`, snapshotErr);
        }
    }

    res.status(200).send('Board deleted successfully');
  } catch (err) {
    console.error(`Error deleting board ${boardId}:`, err);
    return res.status(500).send('Error deleting board');
  }
});

// New endpoint to serve snapshots
app.get('/api/snapshots/:instanceName', (req, res) => {
  const instanceName = req.params.instanceName;
  const filePath = path.join(snapshotsDir, `${instanceName}.png`);
  res.sendFile(filePath, (err) => {
    if (err) {
      // Don't log ENOENT errors as they are common (boards without snapshots)
      if (err.code !== 'ENOENT') {
          console.error(`Error serving snapshot ${instanceName}:`, err);
      }
      res.status(404).send('Snapshot not found');
    }
  });
});

server.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});