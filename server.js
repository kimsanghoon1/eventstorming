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
const OpenAI = require('openai');
const archiver = require('archiver');

const app = express();
const port = 3000;
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir);
}

app.use(cors());
app.use(express.json({ limit: '50mb' }));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

wss.on('connection', setupWSConnection);

// --- API Endpoints for Persistence ---

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

// Get the content of a specific board
app.get('/api/boards/:name', (req, res) => {
  const boardName = req.params.name;
  const filePath = path.join(dataDir, `${boardName}.json`);

  fs.readFile(filePath, 'utf8', (err, data) => {
    if (err) {
      if (err.code === 'ENOENT') {
        // If file doesn't exist, return a default empty board structure
        return res.status(200).json({ items: [], connections: [], boardType: 'Eventstorming' });
      }
      return res.status(500).send('Error loading board');
    }
    res.status(200).json(JSON.parse(data));
  });
});

// Save a board's content
app.post('/api/boards/:name', (req, res) => {
  const boardName = req.params.name;
  const filePath = path.join(dataDir, `${boardName}.json`);
  const data = req.body;

  fs.writeFile(filePath, JSON.stringify(data, null, 2), (err) => {
    if (err) {
      return res.status(500).send('Error saving board');
    }
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
    res.status(200).send('Board deleted successfully');
  });
});

// --- New Code Generation Endpoint (Refactored with Tool Calling) ---

// Configure the OpenAI client to point to your sglang server
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY || 'sglang-dummy-key', // sglang doesn't validate the key
    baseURL: 'http://ai-server.dream-flow.com:30000/v1', // Your sglang server address
});

/**
 * Reads the main board file and any linked UML diagrams to construct a full domain model.
 * This function will be executed locally when the LLM decides to use the 'get_board_data' tool.
 * @param {string} boardName - The name of the main board to load.
 * @returns {Promise<object>} - The combined model data.
 */
async function getBoardData(boardName) {
    // 1. Read the main board file
    const boardPath = path.join(dataDir, `${boardName}.json`);
    let modelData;
    try {
        const fileContent = await fsp.readFile(boardPath, 'utf8');
        modelData = JSON.parse(fileContent);
    } catch (err) {
        console.error(`Could not read or parse main board file ${boardName}:`, err);
        throw new Error(`Board '${boardName}' not found.`);
    }

    // 2. Build the full model by combining EventStorming and linked UML models
    const fullModelData = {
        eventStormingModel: modelData,
        umlModels: [],
    };

    if (modelData.boardType === 'Eventstorming' && modelData.items) {
        const linkedDiagramNames = modelData.items
            .filter(item => item.type === 'Aggregate' && item.linkedDiagram)
            .map(item => item.linkedDiagram);

        const uniqueDiagramNames = [...new Set(linkedDiagramNames)];

        const umlModelPromises = uniqueDiagramNames.map(async (diagramName) => {
            const filePath = path.join(dataDir, `${diagramName}.json`);
            try {
                const fileContent = await fsp.readFile(filePath, 'utf8');
                return JSON.parse(fileContent);
            } catch (err) {
                console.error(`Could not read or parse linked diagram ${diagramName}:`, err);
                return null; // Return null for failed reads
            }
        });

        const umlModels = await Promise.all(umlModelPromises);
        fullModelData.umlModels = umlModels.filter(m => m !== null);
    }
    
    return fullModelData;
}


app.post('/api/generate-code', async (req, res) => {
    const { boardName } = req.body;

    if (!boardName) {
        return res.status(400).send('Board name is required.');
    }

    try {
        // Step 1: Directly call our local function to get the complete board data.
        console.log(`Step 1: Calling local function getBoardData('${boardName}')...`);
        const boardData = await getBoardData(boardName);
        console.log('Step 1: Successfully retrieved board data.');

        // Step 2: Call the LLM for code generation with the full data in the user prompt.
        const codeGenSystemPrompt = `You are an expert software architect specializing in Domain-Driven Design (DDD) and Clean Architecture. Your task is to generate a complete, runnable Java project based on the domain models provided. The project should use Java 17, Spring Boot, Spring Cloud, and JPA (Hibernate).

The final output must be a single, valid JSON object where keys are the full file paths (e.g., 'src/main/java/com/example/domain/Product.java') and values are the corresponding, complete source code for that file. Do not include any text, explanation, or markdown formatting before or after the JSON object. The entire response must be only the JSON object itself.`;

        const codeGenUserPrompt = `Please generate the source code for a Java 17 project based on the following domain models.

The project should use Spring Boot, Spring Cloud for potential future scalability, and JPA (Hibernate) for persistence.

The <code>eventStormingModel</code> describes the overall business process flow, including commands, events, and policies.
The <code>umlModels</code> provide detailed class structures (attributes and methods) for the Aggregates mentioned in the event storming model.

Use both models to generate a cohesive, runnable application that strictly follows Clean Architecture principles. The code should be organized into a standard multi-module Maven project with clear layers:
- <code>pom.xml</code>: A root Maven POM file managing dependencies for all modules.
- <code>domain-module/pom.xml</code>: Maven configuration for the domain module.
- <code>domain-module/src/main/java/...</code>: Contains the core business logic: Entities, Aggregates, Value Objects, and Domain Events. This layer should have no dependencies on other layers.
- <code>application-module/pom.xml</code>: Maven configuration for the application module.
- <code>application-module/src/main/java/...</code>: Contains Application Services (Use Cases) that orchestrate the domain logic. It depends on the Domain layer.
- <code>infrastructure-module/pom.xml</code>: Maven configuration for the infrastructure module.
- <code>infrastructure-module/src/main/java/...</code>: Contains implementations for Repositories (using Spring Data JPA), and any other external service clients. It depends on the Application and Domain layers.
- <code>presentation-module/pom.xml</code>: Maven configuration for the presentation/API module.
- <code>presentation-module/src/main/java/...</code>: Contains API controllers (using Spring Web), DTOs, and the main Spring Boot application class. This is the entry point of the application.

**Domain Models (JSON):**
${JSON.stringify(boardData, null, 2)}`;

        const messagesForFinalCall = [
            { role: 'system', content: codeGenSystemPrompt },
            { role: 'user', content: codeGenUserPrompt }
        ];

        console.log('Step 2: Sending data to LLM for final code generation...');
        const response = await openai.chat.completions.create({
            model: 'openai/gpt-oss-120b',
            messages: messagesForFinalCall,
        });

        const content = response.choices[0].message.content;

        // --- Defensive Check and Enhanced Logging ---
        if (typeof content !== 'string') {
            console.error("Error: LLM response content is null or not a string.");
            console.error("Full LLM Response for debugging:", JSON.stringify(response, null, 2));
            throw new Error('LLM failed to generate valid code content. Check server logs for the full response.');
        }

        console.log("Step 2: LLM returned valid content. Cleaning and parsing...");
        const cleanedContent = content.replace(/^```json\n?|\n?```$/g, '');
        const files = JSON.parse(cleanedContent);

        // Step 3: Create and send the zip archive
        console.log('Step 3: Generating zip archive...');
        const archive = archiver('zip', { zlib: { level: 9 } });
        res.attachment('generated-code.zip');
        archive.pipe(res);

        for (const filePath in files) {
            if (typeof files[filePath] === 'string') {
                archive.append(files[filePath], { name: filePath });
            }
        }
        await archive.finalize();
        console.log('Step 3: Zip archive sent successfully.');

    } catch (error) {
        console.error('Error in /api/generate-code:', error.response ? error.response.data : error.message);
        const errorMsg = error.response ? JSON.stringify(error.response.data) : error.message;
        res.status(500).send(`Failed to generate code. ${errorMsg}`);
    }
});


server.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});