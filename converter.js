const OpenAI = require('openai');

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY || 'sglang-dummy-key',
    baseURL: 'http://ai-server.dream-flow.com:30000/v1',
});

/**
 * Analyzes a database stored procedure and returns a structured representation.
 * @param {string} procedureCode The SQL code of the stored procedure.
 * @param {string} dbType The type of the database (e.g., 'Oracle', 'PostgreSQL').
 * @returns {Promise<Object>} A promise that resolves to the JSON analysis from the LLM.
 */
async function analyzeProcedure(procedureCode, dbType) {
    try {
        const systemPrompt = `You are an expert database architect. Your task is to analyze a stored procedure and provide a detailed, structured JSON representation of its components. 

The final output must be a single JSON object. Do not include any text, explanation, or markdown formatting like \`\`\`json before or after the JSON object.`;

        const userPrompt = `Please analyze the following ${dbType} stored procedure. Break it down into its core components. The JSON output should include sections for:

1.  **parameters**: An array of objects, where each object details an input/output parameter (name, data type, direction).
2.  **variables**: An array of objects for locally declared variables.
3.  **tables**: A list of all tables and views that are read from or written to.
4.  **logic_blocks**: An array of objects representing the main logical blocks of the procedure (e.g., cursors, loops, conditional statements, major DML/SELECT statements). Each block should have a descriptive name, the corresponding SQL code snippet, and a brief explanation of its purpose.

**Source Database:** ${dbType}

**Stored Procedure Code:**

${procedureCode}`;

        const messages = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
        ];

        console.log(`Sending request to LLM to analyze procedure...`);
        const response = await openai.chat.completions.create({
            model: 'openai/gpt-oss-120b',
            messages: messages,
            response_format: { type: "json_object" },
        });

        const content = response.choices[0].message.content;

        if (typeof content !== 'string') {
            console.error("Error: LLM response content is null or not a string.");
            throw new Error('LLM failed to generate valid analysis.');
        }

        console.log("LLM returned analysis. Extracting and parsing JSON...");

        const jsonStart = content.indexOf('{');
        const jsonEnd = content.lastIndexOf('}');

        if (jsonStart === -1 || jsonEnd === -1 || jsonEnd < jsonStart) {
            console.error("Error: Could not find a valid JSON object in the LLM analysis response.", content);
            throw new Error('LLM failed to return a JSON object from analysis.');
        }

        const jsonString = content.substring(jsonStart, jsonEnd + 1);
        
        try {
            const sanitizedJsonString = jsonString.replace(/[\u0000-\u001F\u007F-\u009F]/g, "");
            return JSON.parse(sanitizedJsonString);
        } catch (error) {
            console.error("Error parsing extracted JSON from analysis:", error.message);
            console.error("Attempted to parse:", jsonString);
            throw new Error(`Failed to parse JSON from LLM analysis response. Raw response was: ${content}`);
        }

    } catch (error) {
        console.error('Error in analyzeProcedure:', error.response ? error.response.data : error.message);
        throw error;
    }
}


/**
 * Converts a database stored procedure to a Spring Boot project.
 * @param {string} procedureCode The SQL code of the stored procedure.
 * @param {string} dbType The type of the database (e.g., 'Oracle', 'PostgreSQL').
 * @returns {Promise<Object>} A promise that resolves to an object where keys are file paths and values are file contents.
 */
async function convertProcedure(procedureCode, dbType) {
    try {
        const systemPrompt = `You are an expert software architect. Your task is to generate a complete, runnable, single-module Maven project using Java 17 and Spring Boot, based on a database stored procedure.

The final output must be a single JSON object where keys are the full file paths (e.g., 'pom.xml') and values are the corresponding, complete source code for that file.

**IMPORTANT:**
- The entire response must be ONLY the JSON object itself.
- Do not include any text, explanation, or markdown formatting like 
\`\`\`json
before or after the JSON object.
- The values in the JSON object must be the raw source code, correctly formatted as a JSON string.`;

        const userPrompt = `Please convert the following ${dbType} stored procedure into a complete and runnable Spring Boot application. The conversion must be functionally identical to the original. It must accept equivalent inputs and produce the exact same database state changes and outputs. There are no acceptable deviations.

**Source Database:** ${dbType}

**Stored Procedure Code:**

${procedureCode}

**Core Conversion Requirements (Crucial):**

1.  **100% Functional Equivalence:** The generated Java application MUST be functionally identical to the original stored procedure. It must accept equivalent inputs and produce the exact same database state changes and outputs. There are no acceptable deviations.

2.  **No Omitted Logic:** You are strictly forbidden from omitting or simplifying any logic from the source procedure. Every single filtering condition (WHERE), data join (JOIN), subquery, calculation, and data manipulation (INSERT, UPDATE, DELETE, MERGE) must be perfectly replicated in the Java code.

3.  **Input Parameter Logic (Crucial):** You MUST analyze how every input parameter of the stored procedure is used. If a parameter is used for filtering, this logic must be perfectly replicated.
    - **Conditional Filtering:** Pay special attention to filters that only apply if a parameter is not null or empty. This is a common pattern.
    - **Example:** A SQL clause like \`DECODE(P_PLANT_CODE, '', '1', PLANT_CODE) = DECODE(P_PLANT_CODE, '', '1', P_PLANT_CODE)\` is a conditional filter. It means: "If the input parameter \`P_PLANT_CODE\` is not an empty string, then filter the results \`WHERE PLANT_CODE = P_PLANT_CODE\`." Your generated Java code MUST implement this \`if/else\` logic in the service layer before querying the database.

4.  **Logic-to-Code Mapping:** In the generated Java Service class, you MUST add comments to explain how the Java code maps back to the original procedure's logic. For each significant block of Java code, add a comment indicating which part of the SQL it corresponds to. This is a mandatory requirement for verification.

    *Example Commenting Style:*
    
\`\`\`java
    // Corresponds to the main SELECT...FROM...WHERE clause in the procedure
    List<Entity> initialData = repository.findBy(...);

    // Implements the logic from the first UNION ALL and subsequent filtering
    ...
    \`\`\`

**Project Requirements:**

1.  **\`pom.xml\`:** Generate a complete Maven POM file.

2.  **\`src/main/resources/application.properties\`:** Create a standard properties file.

3.  **Application Structure (package \`com.example\`)**: Create a standard Spring Boot application structure with controllers, services, repositories, and entities.

4.  **Code Quality:**
    *   **Exception Handling:** Implement proper exception handling for all database operations.

5.  **Strict No-Native-Query JPA Conversion Mandate:**
    Your primary goal is to convert the provided SQL into a high-quality, maintainable Java implementation using **pure Spring Data JPA without any native SQL**.

    1.  **Absolute Prohibition of Native Queries:** You are strictly forbidden from using native queries for any reason. This includes \`@Query(nativeQuery = true)\`, \`JdbcTemplate\`, or \`EntityManager.createNativeQuery()\`. The entire data access layer must be implemented using only standard Spring Data JPA features (Query Methods, JPQL, or Criteria API).

    2.  **Handling UNION Clauses:** To handle \`UNION\` or \`UNION ALL\` clauses, you MUST adopt the following "multi-repository fetch" strategy:
        a. For **each and every table** appearing in the \`UNION ALL\` clause, you must generate a corresponding JPA Entity class and a Spring Data JpaRepository interface.
        b. In the main \`@Service\` class, you will then inject all of these newly created repositories.
        c. To gather the data, you will call the appropriate find method on **each repository individually** and then combine all the results into a single \`List\` in your Java code.
        d. This approach will result in a large number of new Entity and Repository files. This is the required and expected outcome.

    3.  **Decomposition of Logic:** All other logic, such as \`MERGE\`, \`JOIN\`s, and filtering, must be decomposed and handled in the Java service layer. For 'MERGE' or 'UPSERT' operations, you must implement a "read-then-write" pattern: check if a record exists using a repository \`find\` method, then either update it or insert it using \`save()\`.`;

        const messages = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
        ];

        console.log(`Sending request to LLM to generate full project...`);
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
            console.error("Attempted to parse:", jsonString);
            throw new Error(`Failed to parse JSON from LLM response. Raw response was: ${content}`);
        }
        
        return files;

    } catch (error) {
        console.error('Error in convertProcedure:', error.response ? error.response.data : error.message);
        throw error;
    }
}

module.exports = { convertProcedure, analyzeProcedure };