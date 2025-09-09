require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fsp = require('fs').promises;
const path = require('path');
const http = require('http');
const OpenAI = require('openai');
const archiver = require('archiver');

const app = express();
const port = 3001;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

const server = http.createServer(app);

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY || 'sglang-dummy-key',
    baseURL: 'http://ai-server.dream-flow.com:30000/v1',
});

app.post('/api/convert-procedure', async (req, res) => {
    const { filePath, dbType, procedureCode: procedureCodeFromRequest } = req.body;

    let procedureCode;
    if (procedureCodeFromRequest) {
        procedureCode = procedureCodeFromRequest;
    } else if (filePath) {
        try {
            procedureCode = await fsp.readFile(filePath, 'utf8');
        } catch (err) {
            console.error(`Error reading file from path: ${filePath}`, err);
            return res.status(500).send(`Could not read file at path: ${filePath}`);
        }
    } else {
        return res.status(400).send('`filePath` or `procedureCode` is required.');
    }

    try {
        const systemPrompt = `You are an expert software architect. Your task is to generate a complete, runnable, single-module Maven project using Java 17 and Spring Boot, based on a database stored procedure.

        The final output must be a single JSON object where keys are the full file paths (e.g., 'pom.xml') and values are the corresponding, complete source code for that file.

        **IMPORTANT:**
        - The entire response must be ONLY the JSON object itself.
        - Do not include any text, explanation, or markdown formatting like 
```json
before or after the JSON object.
        - Ensure any special characters like double quotes (") or backslashes (\\) inside the file content are properly escaped to create valid JSON.`;

        const userPrompt = `Please convert the following ${dbType} stored procedure into a complete and runnable Spring Boot application.

**Source Database:** ${dbType}

**Stored Procedure Code:**

${procedureCode}

**Project Requirements:**

1.  **\`pom.xml\`:** Generate a complete Maven POM file.

2.  **\`src/main/resources/application.properties\`:** Create a standard properties file.

3.  **Application Structure (package \`com.example\`):** Create a standard Spring Boot application structure with controllers, services, repositories, and entities.

4.  **Code Quality:**
    *   **Exception Handling:** Implement proper exception handling for all database operations.

5.  **SQL to JPA Conversion Guidelines:**
    Your goal is to convert the provided SQL into a high-quality, maintainable Java implementation using Spring Data JPA.

    1.  **Decomposition:** Do not perform a direct 1-to-1 conversion of the entire SQL block into a single native query. Instead, decompose the SQL logic into smaller, manageable steps.
    2.  **JPA Repositories:** For each table involved (e.g., 'tq_dq_DAY', 'TL_REV_DB'), create a corresponding JPA Entity and a Spring Data JpaRepository.
    3.  **Service Logic:** Implement the business logic inside a 
@Service
 class.
        *   Use the repositories to fetch the initial data (e.g., from 'tq_dq_DAY').
        *   If the SQL contains complex joins or subqueries (like the 'UNION ALL' block), fetch the data sets separately and perform the join/filtering logic within the Java service method.
        *   For 'MERGE' or 'UPSERT' operations, implement a "read-then-write" pattern in the service:
            a. Use a repository 'findBy' method to check if the target record exists.
            b. If it exists, update it.
            c. If it does not exist ('WHEN NOT MATCHED'), create a new entity object and use the 'save()' method to insert it.
    4.  **Avoid Native Queries:** Only use native queries (\`@Query(nativeQuery=true)\`) as a last resort for logic that is impossible to express in JPQL or Criteria API. The provided 'MERGE' statement is a candidate for decomposition, not for direct native query execution.`;

        const messages = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
        ];

        console.log(`Sending request to LLM to generate full project for: ${filePath || 'direct input'}...`);
        const response = await openai.chat.completions.create({
            model: 'openai/gpt-oss-120b',
            messages: messages,
        });

        const content = response.choices[0].message.content;

        if (typeof content !== 'string') {
            console.error("Error: LLM response content is null or not a string.");
            throw new Error('LLM failed to generate valid code content.');
        }

        console.log("LLM returned content. Extracting JSON...");

        const jsonStart = content.indexOf('{');
        const jsonEnd = content.lastIndexOf('}');

        if (jsonStart === -1 || jsonEnd === -1 || jsonEnd < jsonStart) {
            console.error("Error: Could not find a valid JSON object in the LLM response.", content);
            throw new Error('LLM failed to return a JSON object.');
        }

        const jsonString = content.substring(jsonStart, jsonEnd + 1);
        let files;
        try {
            files = JSON.parse(jsonString);
        } catch (error) {
            console.error("Error parsing extracted JSON:", error.message);
            throw new Error(`Failed to parse JSON from LLM response. Raw response was: ${content}`);
        }

        console.log('Generating zip archive...');
        const archive = archiver('zip', { zlib: { level: 9 } });
        res.attachment('jpa-converted-project.zip');
        archive.pipe(res);

        for (const fPath in files) {
            if (typeof files[fPath] === 'string') {
                archive.append(files[fPath], { name: fPath });
            }
        }
        await archive.finalize();
        console.log('Zip archive sent successfully.');

    } catch (error) {
        console.error('Error in /api/convert-procedure:', error.response ? error.response.data : error.message);
        const errorMsg = error.response ? JSON.stringify(error.response.data) : error.message;
        res.status(500).send(`Failed to convert procedure. ${errorMsg}`);
    }
});

server.listen(port, () => {
  console.log(`JPA Conversion Server listening at http://localhost:${port}`);
});