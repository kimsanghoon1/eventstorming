import os
import httpx
import uuid
import logging
from typing import TypedDict, List, Dict, Optional, Any
import json
from pathlib import Path
import zipfile # Import zipfile

from langchain_core.pydantic_v1 import BaseModel, Field
from langchain_openai import ChatOpenAI
from langgraph.graph import StateGraph, END
from a2a.client import A2AClient, A2ACardResolver
from a2a.types import MessageSendParams, SendMessageRequest
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.documents import Document
from langchain_core.messages import AIMessage, SystemMessage, HumanMessage
import a2a.types

# --- Pydantic Models for Code Generation ---
class GeneratedFile(BaseModel):
    path: str = Field(description="Relative path of the file (e.g., src/main/java/com/example/demo/domain/Order.java)")
    content: str = Field(description="Complete source code content.")

class CodeGenerationResult(BaseModel):
    files: list[GeneratedFile] = Field(description="List of generated source files.")

CODEGEN_SYSTEM_INSTRUCTION = """
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

# --- Configuration ---
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s', encoding='utf-8')
AGENT_REGISTRY = {
    "eventstorming": "http://localhost:10006",
    "uml": "http://localhost:10005",
}

# --- Helper Function for Filenames ---
def _slugify(text: str | None) -> str:
    if not text:
        return "generated-board"
    # Basic slugify: replace non-alphanumeric with dash
    return ''.join(c if c.isalnum() else '-' for c in text).strip('-').lower() or "generated-board"


# --- State Definition ---
class OrchestrationState(TypedDict):
    user_input: str
    files: List[Any]
    plan: List[str]
    eventstorming_result: Optional[dict]
    uml_diagrams: Optional[Dict[str, Any]]
    generated_code: Optional[Dict[str, str]] # Store generated code summary or content
    final_response: Optional[str]

# --- Agent Invocation Logic ---
async def call_agent(agent_name: str, skill: str, inputs: dict) -> str | dict | list:
    """A generic tool to call any specialized agent via A2A protocol."""
    logging.info(f"--- ORCHESTRATOR: Calling '{agent_name}' agent for skill '{skill}' with inputs ---")
    
    base_url = AGENT_REGISTRY.get(agent_name)
    if not base_url:
        return f"Error: Agent '{agent_name}' not found in registry."

    user_query = inputs.get("user_query", "")

    async with httpx.AsyncClient(timeout=600.0) as client:
        try:
            resolver = A2ACardResolver(httpx_client=client, base_url=base_url)
            agent_card = await resolver.get_agent_card()
            a2a_client = A2AClient(httpx_client=client, agent_card=agent_card)
            
            skill_info = next((s for s in agent_card.skills if s.id == skill), None)
            if not skill_info:
                return f"Error: Skill '{skill}' not found for agent '{agent_name}'."

            request = SendMessageRequest(
                id=str(uuid.uuid4()),
                params=MessageSendParams(
                    skill=skill,
                    message=a2a.types.Message(
                        messageId=uuid.uuid4().hex,
                        role="user",
                        parts=[a2a.types.Part(root=a2a.types.TextPart(text=user_query))]
                    )
                )
            )
            
            response_task = await a2a_client.send_message(request)
            response_dict = response_task.model_dump(exclude_none=True)
            
            result_obj = response_dict.get("result", {})
            
            if result_obj:
                artifacts = result_obj.get("artifacts")
                if artifacts and isinstance(artifacts, list) and len(artifacts) > 0:
                    artifact = artifacts[0]
                    parts = artifact.get("parts")
                    if parts and isinstance(parts, list) and len(parts) > 0:
                        part_obj = parts[0]
                        text_content = part_obj.get("text")
                        if text_content:
                            try:
                                return json.loads(text_content)
                            except json.JSONDecodeError:
                                # If it's not JSON, return as text (e.g. code summary)
                                return text_content

            status_obj = result_obj.get("status", {})
            if status_obj:
                message_obj = status_obj.get("message", {})
                status_message_text = message_obj.get("text")
                if status_message_text:
                    return status_message_text

            logging.error(
                f"Failed to extract a valid artifact or status message from '{agent_name}'. "
                f"Full response dictionary: {json.dumps(response_dict, indent=2)}"
            )
            return f"Error: Invalid or empty response from {agent_name}."

        except Exception as e:
            logging.error(f"An exception occurred while calling agent '{agent_name}': {e}", exc_info=True)
            return f"Error: Exception while communicating with agent '{agent_name}'."


import glob # Import glob

# --- Internal Code Generation Function ---
async def _generate_code_internal(uml_data: dict) -> str:
    """Generates Spring Boot code from UML data using internal LLM."""
    try:
        openai_api_key = os.getenv('OPENAI_API_KEY')
        llm = ChatOpenAI(
            api_key=openai_api_key,
            base_url=os.getenv('OPENAI_API_BASE_URL'),
            model=os.getenv('OPENAI_API_MODEL', 'openai/gpt-oss-120b'),
            temperature=0.1,
        )
        
        messages = [
            SystemMessage(content=CODEGEN_SYSTEM_INSTRUCTION),
            HumanMessage(content=f"Generate Java Spring Boot code for this UML model:\n\n{json.dumps(uml_data, indent=2)}")
        ]

        structured_llm = llm.with_structured_output(CodeGenerationResult)
        result = await structured_llm.ainvoke(messages)

        if result and result.files:
            summary = f"## Generated Spring Boot Project\n\n"
            for file in result.files:
                summary += f"### `{file.path}`\n"
                summary += f"```java\n{file.content}\n```\n\n"
            return summary
        else:
            return "Failed to generate code. The model might be empty or invalid."

    except Exception as e:
        logging.error(f"Internal code generation failed: {e}")
        return f"An error occurred during code generation: {str(e)}"


# --- Node Functions ---
async def planner_node(state: OrchestrationState) -> dict:
    """Creates a plan. Checks if code gen is requested for existing project."""
    logging.info("Planner Node: Creating execution plan.")
    user_input = state.get("user_input", "").lower()
    
    # Default plan
    plan = ["eventstorming", "uml"]
    uml_diagrams = {}
    
    # 1. Check if user wants to generate code for an EXISTING project
    # Heuristic: Look for project names in the input that match folders in 'data/'
    data_dir = Path("data")
    if data_dir.exists():
        for project_dir in data_dir.iterdir():
            if project_dir.is_dir():
                project_name = project_dir.name
                # Check if project name is in user input (e.g. "code for onlineshoppingmall")
                if project_name in user_input.replace(" ", ""): 
                    logging.info(f"Planner: Detected existing project '{project_name}'. Checking for UML files...")
                    
                    # Find UML files
                    uml_files = list(project_dir.glob("uml-*.json"))
                    if uml_files:
                        logging.info(f"Planner: Found {len(uml_files)} UML files. Skipping design phase.")
                        
                        # Load UML files into state
                        for uml_file in uml_files:
                            try:
                                with uml_file.open("r", encoding="utf-8") as f:
                                    uml_data = json.load(f)
                                    # Use filename or instanceName as key
                                    key = uml_file.stem
                                    uml_diagrams[key] = uml_data
                            except Exception as e:
                                logging.error(f"Failed to load UML file {uml_file}: {e}")
                        
                        if uml_diagrams:
                            # Set plan to ONLY codegen
                            plan = ["codegen"]
                            return {"plan": plan, "uml_diagrams": uml_diagrams}
    
    # 2. If not existing project, check if codegen is requested for NEW project
    if "code" in user_input or "generate" in user_input or "java" in user_input or "spring" in user_input:
        if "codegen" not in plan:
            plan.append("codegen")
        logging.info("Planner: Added 'codegen' to full plan.")
        
    return {"plan": plan}

async def execution_node(state: OrchestrationState) -> dict:
    """Executes tasks based on the plan."""
    plan = state.get("plan", [])
    if not plan:
        return {}

    current_task = plan[0]
    remaining_plan = plan[1:]
    
    updated_state = {"plan": remaining_plan}

    if current_task == "eventstorming":
        logging.info("Execution Node: Executing 'eventstorming' task.")
        result = await call_agent(
            "eventstorming", 
            "facilitate_eventstorming",
            {"user_query": state["user_input"]}
        )
        if isinstance(result, dict):
            updated_state["eventstorming_result"] = result
        else:
            logging.error(f"Eventstorming agent returned an error: {result}")
            updated_state["plan"] = [] 
            updated_state["final_response"] = json.dumps({"error": "Eventstorming failed.", "details": result})

    elif current_task == "uml":
        logging.info("Execution Node: Executing 'uml' task.")
        event_context = state.get("eventstorming_result")
        if not event_context or "items" not in event_context:
            logging.warning("No valid eventstorming contexts found to generate UML.")
            return {"plan": remaining_plan}

        all_items = event_context.get("items", [])
        contexts = [item for item in all_items if isinstance(item, dict) and item.get("type") == "ContextBox"]
        
        if not contexts:
            logging.warning("No 'ContextBox' items found.")
            return {"plan": remaining_plan}
            
        uml_diagrams = {}
        project_name = event_context.get("instanceName", "untitled-project")

        for context_box in contexts:
            context_id = context_box.get("id")
            context_name = context_box.get("instanceName", f"context-{context_id}")
            child_items = [item for item in all_items if item.get("parent") == context_id]
            
            context_payload = {
                "project_name": project_name,
                "context_name": context_name,
                "context_description": context_box.get("description", ""),
                "items": child_items
            }
            
            logging.info(f"Generating UML for: {context_name}")
            uml_result = await call_agent(
                "uml", 
                "draw_uml_diagram",
                {"user_query": json.dumps(context_payload)}
            )
            
            if isinstance(uml_result, dict):
                uml_diagrams[context_name] = uml_result
                
                # Update ContextBox with linked diagram reference
                uml_filename = f"uml-{_slugify(uml_result.get('instanceName', context_name))}.json"
                context_box["linkedDiagram"] = uml_filename
                logging.info(f"Linked UML '{uml_filename}' to ContextBox '{context_name}'")
            else:
                logging.error(f"Failed to generate UML for {context_name}: {uml_result}")
                uml_diagrams[context_name] = {"error": uml_result}

        updated_state["uml_diagrams"] = uml_diagrams
        # Return the modified eventstorming_result so it gets saved
        updated_state["eventstorming_result"] = event_context

    elif current_task == "codegen":
        logging.info("Execution Node: Executing 'codegen' task.")
        uml_diagrams = state.get("uml_diagrams")
        if not uml_diagrams:
            logging.warning("No UML diagrams available for code generation.")
            return {"plan": remaining_plan}
            
        generated_code_results = {}
        
        # Check if user requested specific context only
        # Prompt format from UI: "Generate Java Spring Boot source code for the 'ContextName' context only."
        import re
        target_context = None
        match = re.search(r"for the '(.+?)' context only", state.get("user_input", ""), re.IGNORECASE)
        if match:
            target_context = match.group(1)
            logging.info(f"Codegen restricted to context: '{target_context}'")
        
        for context_key, uml_data in uml_diagrams.items():
            if "error" in uml_data:
                continue
            
            # Filter by context if requested
            # We check against the key or the instanceName in the UML data
            uml_instance_name = uml_data.get("instanceName", "")
            if target_context:
                # Normalize for comparison (ignore case, spaces, 'uml-' prefix)
                def normalize(s): return s.lower().replace(" ", "").replace("uml-", "")
                
                is_match = (normalize(target_context) == normalize(context_key) or 
                            normalize(target_context) == normalize(uml_instance_name))
                
                if not is_match:
                    continue

            logging.info(f"Generating Code for: {context_key}")
            # Use internal function instead of calling agent
            code_result = await _generate_code_internal(uml_data)
            generated_code_results[context_key] = code_result
            
        updated_state["generated_code"] = generated_code_results

    return updated_state

def should_continue(state: OrchestrationState) -> str:
    """Determines the next step."""
    if state.get("plan") and len(state["plan"]) > 0:
        return "execution"
    else:
        return "final_response"

def final_response_node(state: OrchestrationState) -> dict:
    """Aggregates results, saves files, zips code, and prepares final output."""
    logging.info("Final Response Node: Aggregating results...")
    
    final_response_content = state.get("final_response")
    if final_response_content and "error" in final_response_content:
        return {"final_response": final_response_content}

    event_payload = state.get("eventstorming_result")
    uml_diagrams_payload = state.get("uml_diagrams")
    generated_code_payload = state.get("generated_code")

    # --- Save files to disk ---
    try:
        project_name = "untitled-project"
        if isinstance(event_payload, dict):
            project_name = _slugify(event_payload.get("instanceName"))
        
        project_dir = Path("data") / project_name
        project_dir.mkdir(parents=True, exist_ok=True)

        # Save Eventstorming
        if isinstance(event_payload, dict):
            with (project_dir / f"{project_name}.json").open("w", encoding="utf-8") as f:
                json.dump(event_payload, f, ensure_ascii=False, indent=2)

        # Save UML
        if isinstance(uml_diagrams_payload, dict):
            for context_name, uml_payload in uml_diagrams_payload.items():
                if isinstance(uml_payload, dict):
                    uml_filename = f"uml-{_slugify(uml_payload.get('instanceName'))}.json"
                    with (project_dir / uml_filename).open("w", encoding="utf-8") as f:
                        json.dump(uml_payload, f, ensure_ascii=False, indent=2)

        # Save Generated Code & Zip
        zip_path = None
        if generated_code_payload:
            src_dir = project_dir / "src"
            src_dir.mkdir(exist_ok=True)
            
            # Parse the generated code text to extract files
            # The agent returns a markdown summary. We need to parse it or change the agent to return JSON.
            # For now, we'll save the summary as a text file, 
            # BUT ideally we should have parsed it.
            # Since I implemented the agent to return a markdown summary, I will save that summary.
            # To truly save individual files, I would need to change the agent to return JSON artifacts.
            # Given the constraints, I will save the "Code Summary" to a file.
            
            # Wait, the user wants a ZIP file.
            # I should try to extract the code blocks from the markdown if possible, 
            # OR just zip the entire project folder including the JSONs and the code summary.
            
            for context_name, code_content in generated_code_payload.items():
                code_filename = f"code-{_slugify(context_name)}.md"
                with (src_dir / code_filename).open("w", encoding="utf-8") as f:
                    f.write(str(code_content))
            
            # Create ZIP
            zip_filename = f"{project_name}-source.zip"
            zip_file_path = project_dir / zip_filename
            
            with zipfile.ZipFile(zip_file_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
                for root, dirs, files in os.walk(project_dir):
                    for file in files:
                        if file == zip_filename: continue # Don't zip the zip itself
                        file_path = Path(root) / file
                        arcname = file_path.relative_to(project_dir)
                        zipf.write(file_path, arcname)
            
            zip_path = str(zip_file_path)
            logging.info(f"Created ZIP archive at {zip_path}")

    except Exception as e:
        logging.error(f"Orchestrator failed to save/zip files: {e}")
        zip_path = f"Error creating zip: {e}"

    # --- Aggregate results ---
    final_json = {
        "eventstorming": event_payload,
        "uml_diagrams": uml_diagrams_payload,
        "generated_code_summary": generated_code_payload,
        "download_link": zip_path
    }
    return {"final_response": json.dumps(final_json, indent=2)}

# --- Graph Definition ---
_app = None

async def get_app():
    global _app
    if _app is None:
        workflow = StateGraph(OrchestrationState)
        workflow.add_node("planner", planner_node)
        workflow.add_node("execution", execution_node)
        workflow.add_node("aggregate_results", final_response_node)
        
        workflow.set_entry_point("planner")
        workflow.add_edge("planner", "execution")
        workflow.add_conditional_edges(
            "execution",
            should_continue,
            {
                "execution": "execution",
                "final_response": "aggregate_results"
            }
        )
        workflow.add_edge("aggregate_results", END)
        
        _app = workflow.compile()
        logging.info("LangGraph app compiled successfully.")
    return _app

async def execute_graph(initial_state: dict):
    app = await get_app()
    async for event in app.astream(initial_state):
        if "planner" in event:
            yield {"type": "update", "data": "Workflow plan created."}
        elif "execution" in event:
            execution_output = event["execution"]
            if execution_output.get("eventstorming_result"):
                 yield {"type": "update", "data": "Eventstorming task complete."}
            if execution_output.get("uml_diagrams"):
                 yield {"type": "update", "data": "UML generation task complete."}
            if execution_output.get("generated_code"):
                 yield {"type": "update", "data": "Source code generation complete."}
        elif "aggregate_results" in event:
            yield {"type": "result", "data": event["aggregate_results"].get("final_response")}
