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
const orchestratorUrl = process.env.ORCHESTRATOR_URL || 'http://localhost:10007/';

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

const normalizeRelativePath = (relativePath = '') => {
    if (!relativePath) return '';
    const normalized = path.normalize(relativePath).replace(/^(\.\/|\.\\)/, '').replace(/^[\\/]+/, '');
    return normalized === '.' ? '' : normalized;
};

const ensureSnapshotsSafe = (relativePath = '') => {
    if (!relativePath) return;
    const segments = relativePath.split(/[\\/]/).filter(Boolean);
    if (segments.includes('snapshots')) {
        throw new Error('Operation not permitted inside snapshots directory');
    }
};

const resolvePathSafely = (relativePath = '') => {
    const normalized = normalizeRelativePath(relativePath);
    const baseAbsolute = path.resolve(baseDataDir);
    const absoluteTarget = path.resolve(baseDataDir, normalized);
    if (!absoluteTarget.startsWith(baseAbsolute)) {
        throw new Error('Invalid path');
    }
    ensureSnapshotsSafe(normalized);
    return { absolute: absoluteTarget, relative: normalized };
};

const toRelativePath = (absolutePath) => {
    const relative = path.relative(baseDataDir, absolutePath);
    return normalizeRelativePath(relative).replace(/\\/g, '/');
};

const collectFolders = async (directory, relativePrefix, recursive, results) => {
    const entries = await fsp.readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (entry.name === 'snapshots') continue;
        const nextRelative = relativePrefix ? path.join(relativePrefix, entry.name) : entry.name;
        results.push(nextRelative.replace(/\\/g, '/'));
        if (recursive) {
            await collectFolders(path.join(directory, entry.name), nextRelative, recursive, results);
        }
    }
};

const extractArtifactText = (responseData) => {
    try {
        const artifacts = responseData?.result?.artifacts;
        if (Array.isArray(artifacts)) {
            for (const artifact of artifacts) {
                const parts = artifact?.parts;
                if (Array.isArray(parts)) {
                    for (const part of parts) {
                        if (typeof part?.text === 'string') {
                            return part.text;
                        }
                        if (part?.root?.text) {
                            return part.root.text;
                        }
                    }
                }
            }
        }
    } catch (error) {
        console.error('Failed to extract artifact text from orchestrator response:', error);
    }
    return null;
};

const extractUpdatedBoardData = (payload, preferredType, fallbackName) => {
    if (!payload || typeof payload !== 'object') {
        return null;
    }

    if (preferredType === 'Eventstorming' && payload.eventstorming) {
        const board = payload.eventstorming;
        if (board && board.items && board.connections) {
            return {
                ...board,
                boardType: 'Eventstorming',
                instanceName: board.instanceName || fallbackName || 'updated-eventstorming-board',
            };
        }
    }

    if (preferredType === 'UML' && payload.uml_diagrams) {
        const diagrams = payload.uml_diagrams;
        const existing = fallbackName && diagrams[fallbackName];
        const diagram = existing || Object.values(diagrams).find(d => d && d.items);
        if (diagram) {
            return {
                ...diagram,
                boardType: 'UML',
                instanceName: diagram.instanceName || fallbackName || 'updated-uml-diagram',
            };
        }
    }

    if (payload.boardType && payload.items && payload.connections) {
        return {
            ...payload,
            boardType: payload.boardType || preferredType || 'Eventstorming',
            instanceName: payload.instanceName || fallbackName || 'updated-board',
        };
    }

    return null;
};

const buildBoardUpdatePrompt = (boardData, userPrompt) => {
    const serializedBoard = JSON.stringify(boardData, null, 2);
    const boardLabel = boardData.boardType || 'Eventstorming';
    const name = boardData.instanceName || 'Current Board';

    return `
You are an expert assistant that updates existing ${boardLabel} models.

<existing_board name="${name}" type="${boardLabel}">
${serializedBoard}
</existing_board>

Apply the following user request to the existing board while preserving its overall consistency:
<user_request>
${userPrompt}
</user_request>

When modifying this board:
- Respect the current spatial layout. Reuse existing \`x\`/\`y\` coordinates whenever possible so the user’s mental map stays intact.
- If you must add new items, position them near related contexts without overlapping existing elements. Ensure every item maintains unique screen space.
- Never stack items on top of one another; adjust coordinates slightly (e.g., small offsets) to avoid collisions while keeping them close to their logical parents.
- When the user references a specific context, bounded context name, or service (e.g., "결과조회 컨텍스트에 CQRS 조회 모델 추가"), locate the matching \`ContextBox.instanceName\` inside <existing_board> and add the requested items inside that context instead of creating a new context.
- For any CQRS/query-related request, add explicit \`ReadModel\` objects inside the targeted context, describe what they return, and ensure cross-context queries connect as \`Event -> ReadModel\` with \`"type": "RequestResponse"\`. Do not model CQRS calls as Commands or Policies.
- Do not reposition or resize existing items unless the user explicitly asks to rearrange the board. Copy their saved \`x\`/\`y\` coordinates from <existing_board> so manual adjustments remain intact. Only choose coordinates for truly new items, nudging them just enough to avoid overlaps.

Respond ONLY with valid JSON. If you produce an Eventstorming board, include it under the "eventstorming" key. If you produce UML diagrams, include them under "uml_diagrams" keyed by context/diagram name. Ensure the JSON can be parsed without any additional commentary.
`;
};

const preserveExistingGeometry = (previousBoard, nextBoard) => {
    if (!previousBoard?.items || !nextBoard?.items) {
        return nextBoard;
    }

    const prevById = new Map();
    const prevByName = new Map();

    previousBoard.items.forEach(item => {
        if (item?.id !== undefined && item?.id !== null) {
            prevById.set(item.id, item);
        }
        if (item?.instanceName) {
            prevByName.set(item.instanceName, item);
        }
    });

    const mergedItems = nextBoard.items.map(item => {
        if (!item) return item;
        const match =
            (item.id !== undefined && item.id !== null && prevById.get(item.id)) ||
            (item.instanceName ? prevByName.get(item.instanceName) : null);

        if (match) {
            const preserved = { ...item };
            if (typeof match.x === 'number') {
                preserved.x = match.x;
            }
            if (typeof match.y === 'number') {
                preserved.y = match.y;
            }
            return preserved;
        }
        return item;
    });

    return {
        ...nextBoard,
        items: mergedItems,
    };
};

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

app.post('/api/boards/:boardId(*)/llm-update', async (req, res) => {
    const boardId = req.params.boardId;
    const { prompt, boardData } = req.body || {};

    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
        return res.status(400).json({ error: 'Prompt is required.' });
    }
    if (!boardData || typeof boardData !== 'object') {
        return res.status(400).json({ error: 'Board data is required.' });
    }
    if (!Array.isArray(boardData.items) || !Array.isArray(boardData.connections)) {
        return res.status(400).json({ error: 'Board data must include items and connections arrays.' });
    }

    try {
        const { absolute } = resolvePathSafely(boardId);
        const boardDir = path.dirname(absolute);
        await fsp.mkdir(boardDir, { recursive: true });

        const orchestratorPrompt = buildBoardUpdatePrompt(boardData, prompt.trim());

        const payload = {
            jsonrpc: '2.0',
            id: uuidv4(),
            method: 'message/send',
            params: {
                message: {
                    role: 'user',
                    parts: [{ kind: 'text', text: orchestratorPrompt, content_type: 'text/plain' }],
                    messageId: uuidv4().replace(/-/g, ''),
                },
                skill: 'orchestrate_modeling_workflow',
            },
        };

        console.log(`[LLM-Update] Sending modification request for ${boardId}`);
        const response = await axios.post(orchestratorUrl, payload, { timeout: 600000 });

        const artifactText = extractArtifactText(response.data);
        let updatedBoard = null;
        if (artifactText) {
            try {
                const parsed = JSON.parse(artifactText);
                updatedBoard = extractUpdatedBoardData(
                    parsed,
                    boardData.boardType || 'Eventstorming',
                    boardData.instanceName
                );
            } catch (parseError) {
                console.warn('[LLM-Update] Failed to parse orchestrator artifact as JSON:', parseError);
            }
        }

               if (updatedBoard && updatedBoard.items && updatedBoard.connections) {
                   const mergedBoard = preserveExistingGeometry(boardData, updatedBoard);
            const payloadToSave = {
                       ...mergedBoard,
                       boardType: mergedBoard.boardType || boardData.boardType || 'Eventstorming',
            };

            await fsp.writeFile(absolute, JSON.stringify(payloadToSave, null, 2));
            const cacheKey = path.basename(absolute, '.json');
            boardDataCache[cacheKey] = payloadToSave;

            return res.status(200).json({
                message: 'Board updated via LLM response.',
                updatedBoard: payloadToSave,
            });
        }

        console.warn('[LLM-Update] Orchestrator did not provide structured board data.');
        return res.status(202).json({
            message: 'LLM request completed, but no structured board data was returned. Check orchestrator logs for details.',
            rawResponse: response.data,
        });
    } catch (error) {
        console.error(`[LLM-Update] Failed to process update for ${boardId}:`, error);
        if (error?.response) {
            return res.status(502).json({ error: 'Failed to update board via LLM.', details: error.response.data });
        }
        return res.status(500).json({ error: error.message || 'Unexpected error while calling LLM.' });
    }
});

app.get('/api/folders', async (req, res) => {
    try {
        const relativePath = typeof req.query.path === 'string' ? req.query.path : '';
        const recursive = req.query.recursive === 'true';
        const { absolute, relative } = resolvePathSafely(relativePath);
        await fsp.access(absolute);
        const folders = [];
        await collectFolders(absolute, relative, recursive, folders);
        res.status(200).json(folders);
    } catch (error) {
        if (error?.code === 'ENOENT') {
            return res.status(404).json({ error: 'Folder not found' });
        }
        res.status(400).json({ error: error.message || 'Failed to list folders' });
    }
});

app.post('/api/folders', async (req, res) => {
    try {
        const folderPath = typeof req.body?.path === 'string' ? req.body.path : '';
        if (!folderPath.trim()) {
            return res.status(400).json({ error: 'Folder path is required' });
        }
        const normalized = normalizeRelativePath(folderPath);
        if (!normalized) {
            return res.status(400).json({ error: 'Folder path is required' });
        }
        const { absolute } = resolvePathSafely(normalized);
        await fsp.mkdir(absolute, { recursive: true });
        res.status(201).json({ path: normalized.replace(/\\/g, '/') });
    } catch (error) {
        res.status(500).json({ error: error.message || 'Failed to create folder' });
    }
});

app.delete('/api/folders/:folderPath(*)', async (req, res) => {
    try {
        const folderPath = req.params.folderPath || '';
        const normalized = normalizeRelativePath(folderPath);
        if (!normalized) {
            return res.status(400).json({ error: 'Cannot delete root folder' });
        }
        const { absolute } = resolvePathSafely(normalized);
        await fsp.rm(absolute, { recursive: true, force: true });
        res.status(200).json({ message: 'Folder deleted' });
    } catch (error) {
        if (error?.code === 'ENOENT') {
            return res.status(404).json({ error: 'Folder not found' });
        }
        res.status(500).json({ error: error.message || 'Failed to delete folder' });
    }
});

app.post('/api/items/move', async (req, res) => {
    try {
        const { sourcePath, destinationPath = '' } = req.body || {};
        if (typeof sourcePath !== 'string' || !sourcePath.trim()) {
            return res.status(400).json({ error: 'Source path is required' });
        }
        if (typeof destinationPath !== 'string') {
            return res.status(400).json({ error: 'Destination path is required' });
        }

        const sourceInfo = resolvePathSafely(sourcePath);
        const destinationInfo = resolvePathSafely(destinationPath);

        const sourceStat = await fsp.stat(sourceInfo.absolute);
        const destinationStat = await fsp.stat(destinationInfo.absolute).catch(() => null);

        if (!destinationStat || !destinationStat.isDirectory()) {
            return res.status(400).json({ error: 'Destination folder must exist' });
        }

        const targetPath = path.join(destinationInfo.absolute, path.basename(sourceInfo.absolute));
        if (targetPath === sourceInfo.absolute) {
            return res.status(400).json({ error: 'Source and destination are the same' });
        }
        if (sourceStat.isDirectory() && destinationInfo.absolute.startsWith(sourceInfo.absolute)) {
            return res.status(400).json({ error: 'Cannot move a folder into itself' });
        }

        try {
            await fsp.access(targetPath);
            return res.status(409).json({ error: 'Target already exists in destination' });
        } catch (error) {
            if (error.code !== 'ENOENT') {
                throw error;
            }
        }

        await fsp.rename(sourceInfo.absolute, targetPath);
        res.status(200).json({ path: toRelativePath(targetPath) });
    } catch (error) {
        if (error?.code === 'ENOENT') {
            return res.status(404).json({ error: 'Source not found' });
        }
        res.status(400).json({ error: error.message || 'Failed to move item' });
    }
});

app.post('/api/boards/create-empty', async (req, res) => {
    try {
        const { name, path: targetPath = '', boardType = 'Eventstorming' } = req.body || {};
        if (typeof name !== 'string' || !name.trim()) {
            return res.status(400).json({ error: 'Board name is required' });
        }
        if (!['Eventstorming', 'UML'].includes(boardType)) {
            return res.status(400).json({ error: 'Invalid board type' });
        }

        const trimmedName = name.trim();
        const nameWithoutExt = trimmedName.replace(/\.json$/i, '').trim();
        const safeFileName = nameWithoutExt
            .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '')
            .replace(/\s+/g, '-');

        if (!safeFileName) {
            return res.status(400).json({ error: 'Board name results in an empty filename' });
        }

        const dirInfo = resolvePathSafely(targetPath || '');
        await fsp.mkdir(dirInfo.absolute, { recursive: true });

        const fileName = `${safeFileName}.json`;
        const targetFile = path.join(dirInfo.absolute, fileName);

        try {
            await fsp.access(targetFile);
            return res.status(409).json({ error: 'A board with the same name already exists in this folder' });
        } catch (error) {
            if (error.code !== 'ENOENT') {
                throw error;
            }
        }

        const boardData = {
            instanceName: trimmedName,
            items: [],
            connections: [],
            boardType,
        };

        await fsp.writeFile(targetFile, JSON.stringify(boardData, null, 2));
        res.status(201).json({
            boardId: toRelativePath(targetFile),
            instanceName: trimmedName,
            boardType,
        });
    } catch (error) {
        console.error('Failed to create empty board:', error);
        res.status(400).json({ error: error.message || 'Failed to create board' });
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
            const baseName = file.name.replace('.json', '');
            const relativePath = path.relative(baseDataDir, filePath).replace(/\\/g, '/');
            const folderPath = path.dirname(relativePath).replace(/\\/g, '/');
            umlBoards.push({
              name: boardData.instanceName || baseName,
              instanceName: boardData.instanceName || baseName,
              boardId: relativePath,
              folderPath: folderPath === '.' ? '' : folderPath
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