import json
import os
import logging
from collections.abc import AsyncIterable
from typing import Any, Literal

from langchain_core.messages import AIMessage, SystemMessage, HumanMessage
from langchain_openai import ChatOpenAI
from pydantic import BaseModel, Field

logging.basicConfig(level=logging.INFO, encoding='utf-8')

# --- Pydantic Models for Code Generation ---
class GeneratedFile(BaseModel):
    path: str = Field(description="Relative path of the file (e.g., src/main/java/com/example/demo/domain/Order.java)")
    content: str = Field(description="Complete source code content.")

class CodeGenerationResult(BaseModel):
    files: list[GeneratedFile] = Field(description="List of generated source files.")

class GenerateAgent:
    """
    GenerateAgent - A specialized agent for generating Java Spring Boot source code 
    from a UML class diagram (JSON).
    """

    def __init__(self):
        self.system_instruction = """
You are an expert Java Spring Boot Architect and Developer.
Your task is to generate a production-ready Microservice based on the provided UML Class Diagram.

**Technology Stack:**
- Language: Java 17+
- Framework: Spring Boot 3.x
- Architecture: Hexagonal or Layered Architecture (Controller -> Service -> Repository)
- Persistence: Spring Data JPA (Hibernate)
- Messaging: Spring Cloud Stream (Kafka) or Spring Kafka
- Build Tool: Maven (pom.xml)

**Input:**
- A JSON representation of a UML Class Diagram containing Classes (Aggregates, Entities, ValueObjects, Enums, DTOs, Services) and Relationships.

**Generation Rules:**

1.  **Project Structure**:

4.  **Service Layer**:
    - Implement business logic in `@Service` classes.
    - **Command Handling**: Methods that accept Command DTOs, load Aggregates via Repository, invoke Aggregate methods, and save.
    - **Event Handling**: Methods annotated with `@KafkaListener` (or `@StreamListener`) to handle incoming events.

5.  **API Layer (Controllers)**:
    - Expose REST endpoints for Commands.
    - Use `@RestController`, `@PostMapping`.
    - Map HTTP requests to Command DTOs and call the Service.

6.  **Infrastructure**:
    - Generate `Repository` interfaces extending `JpaRepository`.
    - Generate `application.yml` with basic Kafka and Database config.

**CRITICAL INSTRUCTION**:
- Ensure the code is compilable.
- Add Javadoc comments explaining the mapping from UML.
- If a Class is a `Service` in UML, generate it as a Spring `@Service`.
- If a Class is an `AggregateRoot`, generate it as an `@Entity` and also generate a corresponding `Repository`.
"""
        
        self.openai_api_key = os.getenv('OPENAI_API_KEY')
        self.llm = ChatOpenAI(
            api_key=self.openai_api_key,
            base_url=os.getenv('OPENAI_API_BASE_URL'),
            model=os.getenv('OPENAI_API_MODEL', 'openai/gpt-oss-120b'),
            temperature=0.1, # Low temperature for precise code generation
        )

    async def stream(self, query: str, context_id: str) -> AsyncIterable[dict[str, Any]]:
        """
        Streams the code generation process. 
        The 'query' is expected to be the UML JSON string.
        """
        
        # 1. Notify start
        yield {
            'is_task_complete': False,
            'require_user_input': False,
            'content': 'Analyzing UML model and planning Spring Boot architecture...',
        }

        try:
            # 2. Invoke LLM
            messages = [
                SystemMessage(content=self.system_instruction),
                HumanMessage(content=f"Generate Java Spring Boot code for this UML model:\n\n{query}")
            ]

            # We use with_structured_output to get a clean list of files
            structured_llm = self.llm.with_structured_output(CodeGenerationResult)
            result = await structured_llm.ainvoke(messages)

            # 3. Stream back the files
            if result and result.files:
                file_count = len(result.files)
                yield {
                    'is_task_complete': False,
                    'require_user_input': False,
                    'content': f'Generated {file_count} source files. Preparing output...',
                }

                # Format the output as a markdown code block or a list
                # For the A2A interface, we usually return a summary text.
                # The actual files might be better handled as artifacts, but here we'll dump them in the text for now
                # or assume the executor handles artifacts.
                
                # Let's construct a readable summary
                summary = f"## Generated Spring Boot Project\n\n"
                for file in result.files:
                    summary += f"### `{file.path}`\n"
                    summary += f"```java\n{file.content}\n```\n\n"

                yield {
                    'is_task_complete': True,
                    'require_user_input': False,
                    'content': summary,
                }
            else:
                yield {
                    'is_task_complete': True,
                    'require_user_input': False,
                    'content': "Failed to generate code. The model might be empty or invalid.",
                }

        except Exception as e:
            logging.error(f"Code generation failed: {e}")
            yield {
                'is_task_complete': True,
                'require_user_input': False,
                'content': f"An error occurred during code generation: {str(e)}",
            }

    SUPPORTED_CONTENT_TYPES = ['text', 'text/plain', 'application/json']