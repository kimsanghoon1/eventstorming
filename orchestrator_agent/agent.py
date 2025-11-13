import os
import httpx
import uuid
import logging
from typing import TypedDict, List, Dict, Optional, Any
import json
from pathlib import Path # Import Path for file operations

from langchain_core.pydantic_v1 import BaseModel, Field
from langchain_openai import ChatOpenAI
from langgraph.graph import StateGraph, END
from a2a.client import A2AClient, A2ACardResolver
from a2a.types import MessageSendParams, SendMessageRequest
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.documents import Document
import a2a.types

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
    files: List[Any] # Assuming files can be of any type for now
    plan: List[str]
    eventstorming_result: Optional[dict]
    uml_diagrams: Optional[Dict[str, Any]] # To store multiple UML diagrams
    final_response: Optional[str]

# --- Agent Invocation Logic ---
async def call_agent(agent_name: str, skill: str, inputs: dict) -> str | dict | list:
    """A generic tool to call any specialized agent via A2A protocol."""
    logging.info(f"--- ORCHESTRATOR: Calling '{agent_name}' agent for skill '{skill}' with inputs ---")
    
    base_url = AGENT_REGISTRY.get(agent_name)
    if not base_url:
        return f"Error: Agent '{agent_name}' not found in registry."

    # The specialized agents expect the 'user_query' in a specific format
    # The 'inputs' dictionary here should contain 'user_query'
    user_query = inputs.get("user_query", "")

    async with httpx.AsyncClient(timeout=600.0) as client: # Increased timeout
        try:
            resolver = A2ACardResolver(httpx_client=client, base_url=base_url)
            agent_card = await resolver.get_agent_card()
            a2a_client = A2AClient(httpx_client=client, agent_card=agent_card)
            
            # The skill_id is now part of the agent card, we find it
            skill_info = next((s for s in agent_card.skills if s.id == skill), None)
            if not skill_info:
                return f"Error: Skill '{skill}' not found for agent '{agent_name}'."

            # Construct the request based on A2A protocol
            request = SendMessageRequest(
                id=str(uuid.uuid4()),
                params=MessageSendParams(
                    skill=skill,
                    message=a2a.types.Message(
                        messageId=uuid.uuid4().hex, # Added missing messageId
                        role="user",
                        parts=[a2a.types.Part(root=a2a.types.TextPart(text=user_query))]
                    )
                )
            )
            
            response_task = await a2a_client.send_message(request)
            response_dict = response_task.model_dump(exclude_none=True)
            logging.info(f"RAW RESPONSE from {agent_name}: {json.dumps(response_dict, indent=2)}")

            # Based on the logs, the structure is: response -> result -> artifacts
            result_obj = response_dict.get("result", {})
            
            if result_obj:
                artifacts = result_obj.get("artifacts")
                if artifacts and isinstance(artifacts, list) and len(artifacts) > 0:
                    artifact = artifacts[0]
                    parts = artifact.get("parts")
                    if parts and isinstance(parts, list) and len(parts) > 0:
                        # Correctly access the 'text' key directly from the part object
                        part_obj = parts[0]
                        text_content = part_obj.get("text")
                        if text_content:
                            logging.info(f"SUCCESS: Extracted artifact from '{agent_name}'.")
                            try:
                                return json.loads(text_content)
                            except json.JSONDecodeError:
                                logging.warning(f"Artifact content for '{agent_name}' was not valid JSON.")
                                return text_content

            # If artifact extraction fails, try to get a status message for debugging
            status_obj = result_obj.get("status", {})
            if status_obj:
                message_obj = status_obj.get("message", {})
                status_message_text = message_obj.get("text")
                if status_message_text:
                    logging.warning(f"No artifacts found for '{agent_name}'. Falling back to status message: {status_message_text}")
                    return status_message_text

            # If we reach here, parsing has failed. Log the entire response for debugging.
            logging.error(
                f"Failed to extract a valid artifact or status message from '{agent_name}'. "
                f"Full response dictionary: {json.dumps(response_dict, indent=2)}"
            )
            return f"Error: Invalid or empty response from {agent_name}."

        except Exception as e:
            logging.error(f"An exception occurred while calling agent '{agent_name}': {e}", exc_info=True)
            return f"Error: Exception while communicating with agent '{agent_name}'."


# --- Node Functions ---
async def planner_node(state: OrchestrationState) -> dict:
    """Creates a fixed plan to first run eventstorming, then UML."""
    logging.info("Planner Node: Creating a fixed execution plan.")
    return {"plan": ["eventstorming", "uml"]}

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
            "facilitate_eventstorming", # Corrected skill ID
            {"user_query": state["user_input"]}
        )
        if isinstance(result, dict):
            updated_state["eventstorming_result"] = result
        else:
            logging.error(f"Eventstorming agent returned an error or invalid format: {result}")
            # Stop execution if eventstorming fails
            updated_state["plan"] = [] 
            updated_state["final_response"] = json.dumps({"error": "Eventstorming failed.", "details": result})

    elif current_task == "uml":
        logging.info("Execution Node: Executing 'uml' task.")
        event_context = state.get("eventstorming_result")
        if not event_context or "items" not in event_context:
            logging.warning("No valid eventstorming contexts found to generate UML diagrams.")
            return {"plan": remaining_plan} # Continue to final response

        all_items = event_context.get("items", [])
        contexts = [item for item in all_items if item.get("type") == "ContextBox"]
        
        if not contexts:
            logging.warning("No 'ContextBox' items found in eventstorming result.")
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
            
            logging.info(f"Generating UML for Bounded Context: {context_name}")
            uml_result = await call_agent(
                "uml", 
                "draw_uml_diagram", # Corrected skill ID
                {"user_query": json.dumps(context_payload)}
            )
            
            if isinstance(uml_result, dict):
                uml_diagrams[context_name] = uml_result
            else:
                logging.error(f"Failed to generate UML for {context_name}: {uml_result}")
                uml_diagrams[context_name] = {"error": uml_result}

        updated_state["uml_diagrams"] = uml_diagrams

    return updated_state

def should_continue(state: OrchestrationState) -> str:
    """Determines the next step in the workflow."""
    if state.get("plan") and len(state["plan"]) > 0:
        return "execution" # Continue with the next task
    else:
        return "final_response" # No more tasks, proceed to aggregation

def final_response_node(state: OrchestrationState) -> dict:
    """Aggregates results, saves them to files, and prepares the final JSON output."""
    logging.info("Final Response Node: Aggregating and saving results...")
    
    final_response_content = state.get("final_response")
    if final_response_content and "error" in final_response_content:
        # If an error occurred earlier, just pass it through
        return {"final_response": final_response_content}

    event_payload = state.get("eventstorming_result")
    uml_diagrams_payload = state.get("uml_diagrams")

    # --- Save files to disk in a new project-specific folder ---
    try:
        project_name = "untitled-project"
        if isinstance(event_payload, dict):
            project_name = _slugify(event_payload.get("instanceName"))
        
        project_dir = Path("data") / project_name
        project_dir.mkdir(parents=True, exist_ok=True)

        if isinstance(event_payload, dict):
            # Save the main eventstorming file with the project name
            event_filename = f"{project_name}.json"
            with (project_dir / event_filename).open("w", encoding="utf-8") as f:
                json.dump(event_payload, f, ensure_ascii=False, indent=2)
            logging.info(f"Orchestrator saved eventstorming board to {project_dir / event_filename}")

        if isinstance(uml_diagrams_payload, dict):
            for context_name, uml_payload in uml_diagrams_payload.items():
                if isinstance(uml_payload, dict):
                    uml_filename = f"uml-{_slugify(uml_payload.get('instanceName'))}.json"
                    with (project_dir / uml_filename).open("w", encoding="utf-8") as f:
                        json.dump(uml_payload, f, ensure_ascii=False, indent=2)
                    logging.info(f"Orchestrator saved UML for '{context_name}' to {project_dir / uml_filename}")
    except Exception as e:
        logging.error(f"Orchestrator failed to save files: {e}")
        # We can still try to return the data even if saving fails
    
    # --- Aggregate results for the final response ---
    final_json = {
        "eventstorming": event_payload,
        "uml_diagrams": uml_diagrams_payload
    }
    return {"final_response": json.dumps(final_json, indent=2)}

# --- Graph Definition and Compilation ---
_app = None

async def get_app():
    """Creates, compiles, and returns the LangGraph app as a singleton."""
    global _app
    if _app is None:
        workflow = StateGraph(OrchestrationState)
        workflow.add_node("planner", planner_node)
        workflow.add_node("execution", execution_node)
        workflow.add_node("aggregate_results", final_response_node) # Renamed node
        
        workflow.set_entry_point("planner")
        workflow.add_edge("planner", "execution")
        workflow.add_conditional_edges(
            "execution",
            should_continue,
            {
                "execution": "execution",
                "final_response": "aggregate_results" # Renamed edge destination
            }
        )
        workflow.add_edge("aggregate_results", END) # Renamed edge source
        
        _app = workflow.compile()
        logging.info("LangGraph app compiled successfully.")
    return _app

# --- Main execution function for the executor ---
async def execute_graph(initial_state: dict):
    """Executes the graph asynchronously and streams events."""
    app = await get_app()
    async for event in app.astream(initial_state):
        # This streams out all events, allowing the executor to see the flow.
        # We'll filter for specific node outputs to provide meaningful updates.
        if "planner" in event:
            yield {"type": "update", "data": "Workflow plan created."}
        elif "execution" in event:
            execution_output = event["execution"]
            if execution_output.get("eventstorming_result"):
                 yield {"type": "update", "data": "Eventstorming task complete."}
            if execution_output.get("uml_diagrams"):
                 yield {"type": "update", "data": "UML generation task complete."}
        elif "aggregate_results" in event: # Renamed event key
            # The final, aggregated result
            yield {"type": "result", "data": event["aggregate_results"].get("final_response")}
