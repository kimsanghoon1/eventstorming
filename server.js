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
const multer = require('multer');
const unzipper = require('unzipper');
const AdmZip = require('adm-zip');
const upload = multer({ dest: 'uploads/' });

const app = express();
const port = 3000;

const baseDataDir = path.join(__dirname, 'data');
const eventstormingDir = path.join(baseDataDir, 'eventstorming');
const umlDir = path.join(baseDataDir, 'uml');
const snapshotsDir = path.join(baseDataDir, 'snapshots');

// Ensure directories exist
[baseDataDir, eventstormingDir, umlDir, snapshotsDir].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

app.disable('etag'); // Disable ETag generation to prevent 304 responses
app.use(cors());
app.use(express.json({ limit: '50mb' }));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

wss.on('connection', setupWSConnection);

// --- API Endpoints for Persistence ---

// Helper to find board path
const getBoardPath = async (instanceName) => {
    const eventstormingPath = path.join(eventstormingDir, `${instanceName}.json`);
    const umlPath = path.join(umlDir, `${instanceName}.json`);
    try {
        await fsp.access(eventstormingPath);
        return { path: eventstormingPath, type: 'Eventstorming' };
    } catch (e) {
        try {
            await fsp.access(umlPath);
            return { path: umlPath, type: 'UML' };
        } catch (e) {
            return { path: eventstormingPath, type: 'Eventstorming' }; // Default to eventstorming for new boards
        }
    }
};

app.get('/api/boards', async (req, res) => {
  try {
    const processDir = async (dir, type) => {
        const files = await fsp.readdir(dir);
    const jsonFiles = files.filter(file => file.endsWith('.json'));
    const boardPromises = jsonFiles.map(async (file) => {
            const filePath = path.join(dir, file);
        try {
            const fileContent = await fsp.readFile(filePath, 'utf8');
            if (fileContent.trim() === '') return null;
            const boardData = JSON.parse(fileContent);
            const stats = await fsp.stat(filePath);

                const boardName = file.replace('.json', '');
                const snapshotPath = path.join(snapshotsDir, `${boardName}.png`);
                let snapshotUrl = null;
                try {
                    await fsp.access(snapshotPath);
                    snapshotUrl = `/api/snapshots/${boardName}`;
                } catch (e) { /* No snapshot exists */ }

                return {
                    instanceName: boardData.instanceName || boardName,
                    type: boardData.boardType || type,
                    savedAt: stats.mtime,
                    snapshotUrl: snapshotUrl,
                };
            } catch (e) {
                console.error(`Error processing board file ${file}:`, e);
                return null;
            }
    });
        return Promise.all(boardPromises);
    };

    const eventstormingBoards = await processDir(eventstormingDir, 'Eventstorming');
    const umlBoards = await processDir(umlDir, 'UML');

    const allBoards = [...eventstormingBoards, ...umlBoards];
    const boards = allBoards.filter(b => b !== null).sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));
    res.status(200).json(boards);
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

// Get the content of a specific board (dynamic route, should be last)
app.get('/api/boards/:instanceName', async (req, res) => {
  const instanceName = req.params.instanceName;
  const { path: filePath, type } = await getBoardPath(instanceName);

  try {
    const data = await fsp.readFile(filePath, 'utf8');
    const boardData = JSON.parse(data);

    // If it's an Eventstorming board, enrich aggregates with UML attributes
    if (boardData.boardType === 'Eventstorming' && boardData.items) {
      for (const item of boardData.items) {
        if (item.type === 'Aggregate' && item.linkedDiagram) {
          const umlFilePath = path.join(umlDir, `${item.linkedDiagram}.json`);
          try {
            const umlData = await fsp.readFile(umlFilePath, 'utf8');
            const umlBoard = JSON.parse(umlData);
            // Find the class with AggregateRoot stereotype or the first class
            const aggregateClass = umlBoard.items.find(i => i.stereotype === 'AggregateRoot') || umlBoard.items.find(i => i.type === 'Class');
            if (aggregateClass && aggregateClass.attributes) {
              item.attributes = aggregateClass.attributes;
            }
          } catch (umlErr) {
            console.error(`Could not read or parse linked diagram ${item.linkedDiagram}:`, umlErr);
            // Continue without enrichment if a linked diagram is not found
          }
        }
      }
    }

    res.status(200).json(boardData);
  } catch (err) {
    if (err.code === 'ENOENT') {
      return res.status(200).json({ items: [], connections: [], boardType: 'Eventstorming' });
    }
    console.error(`Error loading board ${instanceName}:`, err);
    return res.status(500).send('Error loading board');
  }
});

// Save a board's content with snapshot (dynamic route, should be after specific routes)
app.post('/api/boards/:instanceName', async (req, res) => {
  const instanceName = req.params.instanceName;
  const { snapshot, ...boardData } = req.body;
  const boardType = boardData.boardType || 'Eventstorming';
  const targetDir = boardType === 'UML' ? umlDir : eventstormingDir;
  const filePath = path.join(targetDir, `${instanceName}.json`);

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
  console.log('boardName in headless-save: ', boardName);
  const targetDir = boardType === 'UML' ? umlDir : eventstormingDir;
  const filePath = path.join(targetDir, `${boardName}.json`);

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

// Delete a board (dynamic route, should be last)
app.delete('/api/boards/:instanceName', async (req, res) => {
  const instanceName = req.params.instanceName;
  const { path: filePath } = await getBoardPath(instanceName);

  try {
    // Delete the board json file
    await fsp.unlink(filePath);

    // Delete the associated snapshot
    const snapshotPath = path.join(snapshotsDir, `${instanceName}.png`);
    try {
        await fsp.unlink(snapshotPath);
    } catch (snapshotErr) {
        if (snapshotErr.code !== 'ENOENT') { // Ignore error if snapshot doesn't exist
            console.error(`Could not delete snapshot for ${instanceName}:`, snapshotErr);
        }
    }

    res.status(200).send('Board deleted successfully');
  } catch (err) {
    console.error(`Error deleting board ${instanceName}:`, err);
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
    const boardPath = path.join(eventstormingDir, `${boardName}.json`);
    let initialModelData;
    try {
        const fileContent = await fsp.readFile(boardPath, 'utf8');
        initialModelData = JSON.parse(fileContent);
    } catch (err) {
        console.error(`Could not read or parse main board file ${boardName}:`, err);
        throw new Error(`Board '${boardName}' not found.`);
    }

    const allUmlModels = {};
    const linkedDiagramNames = initialModelData.items
            .filter(item => item.type === 'Aggregate' && item.linkedDiagram)
            .map(item => item.linkedDiagram);
        const uniqueDiagramNames = [...new Set(linkedDiagramNames)];

        const umlModelPromises = uniqueDiagramNames.map(async (diagramName) => {
        const filePath = path.join(umlDir, `${diagramName}.json`);
            try {
                const fileContent = await fsp.readFile(filePath, 'utf8');
            allUmlModels[diagramName] = JSON.parse(fileContent);
            } catch (err) {
                console.error(`Could not read or parse linked diagram ${diagramName}:`, err);
        }
    });
    await Promise.all(umlModelPromises);

    let contexts = initialModelData.items
        .filter(item => item.type === 'ContextBox')
        .map(contextBox => {
            const contextName = contextBox.instanceName;
            const itemsInContext = initialModelData.items.filter(item => item.parent === contextBox.id);
            const itemIdsInContext = new Set(itemsInContext.map(item => item.id));

            const connectionsInContext = initialModelData.connections.filter(conn =>
                itemIdsInContext.has(conn.from) && itemIdsInContext.has(conn.to)
            );

            const eventStormingModel = {
                boardType: initialModelData.boardType,
                items: itemsInContext,
                connections: connectionsInContext,
            };
            
            const linkedDiagramsInContext = itemsInContext
                .filter(item => item.type === 'Aggregate' && item.linkedDiagram)
                .map(item => item.linkedDiagram);

            const umlModels = [...new Set(linkedDiagramsInContext)]
                .map(name => allUmlModels[name])
                .filter(Boolean);

            return {
                contextName,
                eventStormingModel,
                umlModels,
            };
        });

    // If no contexts are defined, treat the entire board as a single context.
    if (contexts.length === 0) {
        console.log("No Bounded Contexts found. Proceeding to generate a single project for the entire board.");
        const allLinkedDiagrams = Object.values(allUmlModels);
        const { snapshot, ...restOfModel } = initialModelData; // Destructure to remove snapshot
        contexts = [{
            contextName: boardName, // Use the board name as the context name
            eventStormingModel: restOfModel,
            umlModels: allLinkedDiagrams,
        }];
    }

    return {
        boardName,
        contexts,
    };
}


app.post('/api/generate-code', async (req, res) => {
    const { boardName } = req.body;

    if (!boardName) {
        return res.status(400).send('Board name is required.');
    }

    try {
        console.log(`Step 1: Calling local function getBoardData('${boardName}')...`);
        const boardData = await getBoardData(boardName);
        console.log('Step 1: Successfully retrieved and structured board data by context.');

        const codeGenSystemPrompt = `You are an expert software architect specializing in Domain-Driven Design (DDD) and Clean Architecture. Your task is to generate one or more complete, runnable Java microservice projects based on the domain models provided.

Each project must use Java 17, Spring Boot, Spring Cloud, JPA (Hibernate), and an in-memory H2 database.

The final output must be a single, valid JSON object. The keys of this JSON object must be the full file paths, including the root directory of the specific microservice (e.g., 'order-context/pom.xml'). The values must be the corresponding complete source code for that file.

Crucially, all source code (the JSON values) must be properly escaped to form a valid JSON string. For example, all double quotes must be escaped as \\" and all backslashes must be escaped as \\\\.

Do not include any text, explanation, or markdown formatting before or after the JSON object. The entire response must be only the JSON object itself.`;

        const codeGenUserPrompt = `Please generate the source code for Java 17 microservices based on the 'contexts' array provided in the domain model. Each element in the 'contexts' array represents a single, independent microservice project that must be generated.

**Crucially, for each context, you must generate a complete, standalone, single-module Maven project inside its own root directory.**

The root directory for each microservice must be named after its 'contextName', converted to kebab-case (e.g., 'Order Context' becomes 'order-context'). All file paths in the final JSON output must be prefixed with this root directory.

For example, if there are two contexts, 'Order Context' and 'Inventory Context', the keys in the final JSON should look like this:
- \`order-context/pom.xml\`
- \`order-context/src/main/java/com/example/order/domain/Order.java\`
- \`inventory-context/pom.xml\`
- \`inventory-context/src/main/java/com/example/inventory/domain/Inventory.java\`
- etc.

For EACH generated microservice, the technology stack must be:
- **Spring Boot**, **Spring Cloud**, **JPA (Hibernate)**, **H2 Database**, **Apache Kafka**.

For EACH microservice, the root \`pom.xml\`'s \`artifactId\` must be the kebab-cased 'contextName'. It must include dependencies for \`spring-boot-starter-data-jpa\`, \`spring-boot-starter-web\`, \`spring-cloud-dependencies\`, \`spring-kafka\`, and the \`h2\` runtime dependency.

For EACH microservice, provide a \`src/main/resources/application.properties\` file with the following content. You MUST replace \`\${'CONTEXT_NAME_PLACEHOLDER'}\` with the actual kebab-cased context name for that specific service.
\`\`\`properties
# Server Port
server.port=8080

# H2 Database Configuration
spring.h2.console.enabled=true
spring.h2.console.path=/h2-console
spring.datasource.url=jdbc:h2:mem:${boardData.boardName.toLowerCase()}-\${'CONTEXT_NAME_PLACEHOLDER'};DB_CLOSE_DELAY=-1
spring.datasource.driverClassName=org.h2.Driver
spring.datasource.username=sa
spring.datasource.password=
spring.jpa.database-platform=org.hibernate.dialect.H2Dialect
spring.jpa.hibernate.ddl-auto=update

# Kafka Configuration
spring.kafka.bootstrap-servers=localhost:9092
spring.kafka.consumer.group-id=\${'CONTEXT_NAME_PLACEHOLDER'}-group
\`\`\`

For EACH microservice, the code should be organized into a standard package structure that follows Clean Architecture principles within the single module:
- \`com.example.{contextName}.domain\`: Contains Aggregates, Entities, Value Objects.
- \`com.example.{contextName}.application\`: Contains Application Services (Use Cases).
- \`com.example.{contextName}.infrastructure\`: Contains Repository implementations and Kafka producers/consumers.
- \`com.example.{contextName}.presentation\`: Contains API controllers.
- \`com.example.{contextName}\`: Must contain the main Spring Boot application class annotated with \`@SpringBootApplication\` and a simple health check \`@RestController\`.

Finally, for EACH microservice, generate a \`build-and-run.bat\` file in its root directory (e.g., 'order-context/build-and-run.bat'). The content of this script must be exactly:
\`\`\`bat
call mvn clean install
call mvn spring-boot:run
\`\`\`

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

app.post('/api/reverse-engineer', async (req, res) => {
  const zipPath = path.join(__dirname, 'ShopProject-code.zip'); // Hard-coded for local testing
  try {
    const zip = new AdmZip(zipPath);
    const zipEntries = zip.getEntries();
    const codeFiles = {};

    zipEntries.forEach(entry => {
      if (!entry.isDirectory && entry.entryName.endsWith('.java')) {
        codeFiles[entry.entryName] = zip.readAsText(entry);
      }
    });

    console.log('Extracted files:', Object.keys(codeFiles));

    // --- Pre-filter source code to send only relevant files to LLM ---
    const coreKeywords = ['@Aggregate', '@AggregateRoot', '@Entity', 'interface '];
    const coreFiles = {};
    const referencedFiles = new Set();

    // 1. First pass: Find core domain files
    for (const [name, content] of Object.entries(codeFiles)) {
      if (coreKeywords.some(keyword => content.includes(keyword))) {
        coreFiles[name] = content;
        // Simple regex to find referenced types (e.g., new OrderLine(), List<OrderLine>)
        const references = (content.match(/[A-Z][a-zA-Z0-9_]+/g) || []);
        references.forEach(ref => referencedFiles.add(`${ref}.java`));
      }
    }

    // 2. Second pass: Add referenced value objects, enums, etc.
    for (const [name, content] of Object.entries(codeFiles)) {
      const fileName = path.basename(name);
      if (referencedFiles.has(fileName) && !coreFiles[name]) {
        coreFiles[name] = content;
      }
    }
    
    console.log('Filtered core files for analysis:', Object.keys(coreFiles));


    if (Object.keys(coreFiles).length === 0) {
      throw new Error('No core domain Java files found in the ZIP');
    }

    const analysisPrompt = `You are an AI expert in reverse engineering Java code. Analyze the following CORE DOMAIN source code files and reconstruct two separate models:
1.  An Eventstorming model (focusing on DDD elements like Aggregates, Commands, Events).
2.  A UML class diagram model (focusing on Classes, Interfaces, Enums, ValueObjects).

IMPORTANT: Your response MUST be ONLY a valid JSON object with two top-level keys: "eventstormingModel" and "umlModel". Each must contain an "items" array and a "connections" array. Do NOT include any introductory text.

**Data Schema Requirements (Crucial):**
- Each object in the "items" array MUST have a unique integer "id".
- Each object in the "items" array MUST use the "instanceName" property for its name.
- Each object in the "items" array MUST include integer values for "x", "y", "width", and "height".
- The layout (x, y coordinates) should be logical and visually organized. For Eventstorming, arrange items chronologically from left to right (Command -> Aggregate -> Event). For UML, group related classes and respect inheritance hierarchies.
- Each object in the "connections" array MUST use "from" and "to" properties, referencing the integer "id" of an item.
- For UML models, the "attributes" property MUST be an array of objects, each with "visibility", "name", and "type" fields.
- For Eventstorming models, items should have a "parent" property referencing the "id" of their ContextBox if applicable.

**Example of a valid, minimal output:**
\`\`\`json
{
  "eventstormingModel": {
    "items": [
      { "id": 100, "type": "ContextBox", "instanceName": "Order Context", "x": 50, "y": 50, "width": 400, "height": 300 },
      { "id": 101, "type": "Aggregate", "instanceName": "Order", "parent": 100, "x": 100, "y": 100, "width": 150, "height": 100 }
    ],
    "connections": []
  },
  "umlModel": {
    "items": [
      { "id": 200, "type": "Class", "instanceName": "Order", "x": 100, "y": 100, "width": 180, "height": 120, "attributes": [{ "visibility": "private", "name": "orderId", "type": "Long" }] }
    ],
    "connections": []
  }
}
\`\`\`

Code Files:
${Object.entries(coreFiles).map(([name, content]) => `\nFile: ${name}\nContent:\n${content}`).join('\n')}`;

    const response = await openai.chat.completions.create({
      model: 'openai/gpt-oss-120b',
      messages: [{ role: 'user', content: analysisPrompt }],
    });

    const rawContent = response.choices[0].message.content;
    console.log('Raw LLM response (initial extraction):', rawContent);

    const initialModelData = JSON.parse(rawContent);

    // --- Second LLM call for layout and connection refinement ---
    const refinementPrompt = `You are a diagram layout and relationship refinement expert. Given the following raw Eventstorming and UML models, refine them according to these strict rules:

1.  **Eventstorming Model Refinement**:
    -   **Layout**: For each ContextBox, place its main Aggregate in the center. Place Commands/Policies to the left and Events to the right of the Aggregate, positioning them closely to form a tight visual group.
    -   **Dynamic Aggregate Sizing**: The 'width' of each Aggregate MUST be dynamically calculated to be proportional to the total width of the Event items flowing from it.
    -   **Dynamic ContextBox Sizing**: After positioning all child elements, you MUST recalculate the 'width' and 'height' of each ContextBox so it perfectly encloses all its children with a reasonable padding.
    -   **Connection Transformation**: Transform connections through an Aggregate (e.g., Command -> Aggregate -> Event) into direct connections (e.g., Command -> Event).

2.  **UML Model Refinement**:
    -   **Splitting by Aggregate**: Analyze the UML classes and group them by the Aggregate they belong to. Each Aggregate and its related classes (Value Objects, Enums, etc.) should form a separate UML model.
    -   **Layout**: For each separated UML model, create a logical layout. Place parent classes above children and group related classes.
    -   **Output Format**: The "umlModels" key in the final JSON MUST contain an array of these separated UML model objects.

3.  **Final JSON Output Structure**:
    -   Return a single JSON object with two top-level keys: "eventstormingModel" (containing a single object) and "umlModels" (containing an array of objects).
    -   The schema for every item (integer id, instanceName, x, y, width, height) and connection (from, to) MUST be strictly followed.

**Raw Models to Refine:**
${JSON.stringify(initialModelData, null, 2)}`;

    console.log('Sending refinement prompt to LLM...');
    const refinementResponse = await openai.chat.completions.create({
      model: 'openai/gpt-oss-120b',
      messages: [{ role: 'user', content: refinementPrompt }],
    });

    const refinedContent = refinementResponse.choices[0].message.content;
    console.log('Raw LLM response (refined):', refinedContent);

    // Clean up potential markdown wrappers from the LLM response
    const cleanedContent = refinedContent.replace(/^```json\n?|\n?```$/g, '');

    const finalModelData = JSON.parse(cleanedContent);
    res.json(finalModelData);
  } catch (err) {
    console.error('Error in /api/reverse-engineer:', err);
    res.status(500).send('Error analyzing code: ' + err.message);
    }
});


server.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});