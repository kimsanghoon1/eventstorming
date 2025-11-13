import json
from datetime import datetime
from langchain_core.pydantic_v1 import BaseModel, Field, ValidationError
from langchain_openai import ChatOpenAI
import os
import logging
import asyncio
from langchain_core.messages import AIMessage
from langchain_core.output_parsers import JsonOutputParser
from langchain_core.pydantic_v1 import BaseModel, Field, parse_obj_as

logging.basicConfig(level=logging.INFO, encoding='utf-8')

# --- LLM for generating domain-specific content ---
llm = ChatOpenAI(
    api_key=os.getenv('OPENAI_API_KEY'),
    base_url=os.getenv('OPENAI_API_BASE_URL'),
    model=os.getenv('OPENAI_API_MODEL'),
    temperature=0.2,
)


# --- Structured Output Models using Pydantic ---
class DomainEvent(BaseModel):
    name: str = Field(description="Name of the domain event, e.g., 'Order Placed' or 'User Registered'")
    description: str = Field(description="A brief description of what this event signifies.")


class DomainCommand(BaseModel):
    name: str = Field(description="Name of the command, e.g., 'Place Order' or 'Register User'")
    description: str = Field(description="A brief description of what this command does.")


class DomainPolicy(BaseModel):
    name: str = Field(description="Name of the policy, e.g., 'Send Welcome Email' or 'Notify Inventory Service'")
    description: str = Field(description="A brief description of what this policy does in response to an event.")


class DomainAggregate(BaseModel):
    name: str = Field(description="Name of the aggregate, e.g., 'Order' or 'User'")
    description: str = Field(description="A brief description of the aggregate's responsibility.")

class DomainConnection(BaseModel):
    from_name: str = Field(description="The name of the source item, which is typically an Event.")
    to_name: str = Field(description="The name of the target item, typically a Command or Policy in another context.")
    type: str = Field(default="Flow", description="The type of connection, usually 'Flow'.")

class BoundedContext(BaseModel):
    name: str = Field(description="Name of the bounded context, e.g., 'Order Management' or 'User Accounts'")
    description: str = Field(description="A brief description of the context's responsibilities.")
    events: list[DomainEvent] = Field(description="List of key domain events within this context.")
    commands: list[DomainCommand] = Field(description="List of key domain commands within this context.")
    policies: list[DomainPolicy] = Field(description="List of key domain policies within this context.")
    aggregates: list[DomainAggregate] = Field(description="List of key domain aggregates within this context.")


class EventstormingConcepts(BaseModel):
    """A list of key concepts identified during an Eventstorming session, organized by Bounded Context."""
    project_name: str = Field(description="A short, descriptive, slug-friendly name for the project, e.g., 'OnlineShoppingCart' or 'UserAuthentication'.")
    contexts: list[BoundedContext] = Field(description="List of bounded contexts identified for the microservice architecture.")
    connections: list[DomainConnection] = Field(description="A list of connections between items across different contexts.")


# --- Prompt for LLM ---
async def _generate_eventstorming_concepts(description: str) -> EventstormingConcepts | None:
    """Uses an LLM to generate domain-specific concepts from a user description."""
    prompt = f"""
    You are a world-class expert in Domain-Driven Design (DDD) and Eventstorming.
    Your goal is to analyze the user's request and generate a structured JSON object representing the key concepts of an Eventstorming board for a microservice architecture.

    **Analyze the following user request carefully:**
    ---
    {description}
    ---

    Follow these steps carefully based on the User Request above. This is a "Chain of Thought" process:
    
    1.  **Identify Bounded Contexts**: First, identify the distinct bounded contexts from the user's description. Each context should represent a specific microservice (e.g., "User Management", "Order Processing"). Define each context with a unique `name` and a `description`.
2.  **Define Core Components**: For each bounded context, identify its core components:
    *   `aggregates`: The main domain objects or entities within the context (e.g., "User", "Order").
    *   `commands`: Actions that trigger changes to aggregates (e.g., "RegisterUser", "PlaceOrder").
    *   `events`: The outcomes or results of commands (e.g., "UserRegistered", "OrderPlaced").
    *   `policies`: Reactions to events, often triggering commands in other contexts (e.g., "SendWelcomeEmail").
3.  **Structure the JSON**: Create a JSON object with a `project_name` and a list of `contexts`. Each context object in the list must contain its `name`, `description`, and lists for `aggregates`, `commands`, `events`, and `policies`.
4.  **CRITICAL - Generate Connections**: After defining all contexts and their items, meticulously analyze the relationships BETWEEN contexts. Create a `connections` list at the root of the JSON object.
    *   **Rule 1**: Connections MUST originate from an `Event` in one context.
    *   **Rule 2**: Connections MUST target a `Command` or a `Policy` in a DIFFERENT context.
    *   **Rule 3**: NEVER create connections between two events (Event -> Event is forbidden).
    *   **Rule 4**: NEVER create connections between items within the SAME context. Connections represent inter-service communication.
    *   For each connection, specify `from_name` (the event's name) and `to_name` (the target command/policy's name).

**Example Output Structure:**
```json
{{
  "project_name": "ExampleECommerce",
  "contexts": [
    {{
      "name": "UserAccountContext",
      "description": "Manages user registration and authentication.",
      "aggregates": [{{"name": "User", "description": "Represents a user."}}],
      "commands": [{{"name": "RegisterUser", "description": "Command to register a new user."}}],
      "events": [{{"name": "UserRegistered", "description": "Occurs when a user successfully registers."}}],
      "policies": []
    }},
    {{
      "name": "NotificationContext",
      "description": "Handles sending notifications to users.",
      "aggregates": [],
      "commands": [],
      "events": [],
      "policies": [{{"name": "SendWelcomeEmailPolicy", "description": "Policy to send a welcome email."}}]
    }}
  ],
  "connections": [
    {{
      "from_name": "UserRegistered",
      "to_name": "SendWelcomeEmailPolicy",
      "type": "Flow"
    }}
  ]
}}
```
- Ensure all fields (`project_name`, `contexts`, `name`, `description`, `aggregates`, etc.) are always present, even if their value is an empty list. Do not omit any fields.
- Generate a comprehensive model. Do not produce trivial or overly simplistic examples. The model should be practically usable.
"""
    for i in range(3):
        try:
            response = await llm.ainvoke(prompt)
            # Clean up the response by stripping markdown and leading/trailing whitespace
            if isinstance(response, AIMessage):
                response_content = response.content
            else:
                response_content = str(response)
            
            clean_json_str = response_content.strip().removeprefix("```json").removesuffix("```")
            
            # Manually parse the JSON and validate with Pydantic
            data = json.loads(clean_json_str)
            concepts = EventstormingConcepts.parse_obj(data)
            logging.info("Successfully parsed EventstormingConcepts.")
            return concepts
        except (json.JSONDecodeError, ValidationError) as e:
            logging.warning(f"Failed to parse or validate LLM response on attempt {i+1}. Error: {e}. Retrying...")
            await asyncio.sleep(1) # Wait before retrying
        except Exception as e:
            logging.error(f"An unexpected error occurred on attempt {i+1}: {e}")
            await asyncio.sleep(1)

    logging.error("LLM failed to generate concepts after multiple retries.")
    return None


def _slugify(text: str) -> str:
    return ''.join(c if c.isalnum() else '-' for c in text).strip('-').lower() or 'eventstorming-board'


def _create_eventstorming_board(description: str, concepts: EventstormingConcepts | None) -> dict:
    if concepts:
        board_name = _slugify(concepts.project_name)
        items = []
        connections = []
        item_id_counter = 1
        name_to_id_map = {}
        
        # --- Final, Corrected Layout Logic: Absolute Coordinates ---
        CONTEXT_H_GAP = 50
        ITEM_H_GAP = 50
        ITEM_V_GAP = 30
        PADDING = 50
        ITEM_WIDTH = 220
        ITEM_HEIGHT = 100
        AGGREGATE_WIDTH = ITEM_WIDTH + 40

        global_x_offset = PADDING

        for context in concepts.contexts:
            # 1. Group items into columns
            left_col_data = [("Command", cmd) for cmd in context.commands] + [("Policy", pol) for pol in context.policies]
            center_col_data = [("Aggregate", agg) for agg in context.aggregates]
            right_col_data = [("Event", evt) for evt in context.events]
            
            # 2. Calculate relative positions and inner dimensions as if starting at (0,0)
            relative_x_left = PADDING
            relative_x_center = relative_x_left + (ITEM_WIDTH + ITEM_H_GAP if left_col_data else 0)
            relative_x_right = relative_x_center + (AGGREGATE_WIDTH + ITEM_H_GAP if center_col_data else 0)

            last_x = 0
            if right_col_data:
                last_x = relative_x_right + ITEM_WIDTH
            elif center_col_data:
                last_x = relative_x_center + AGGREGATE_WIDTH
            elif left_col_data:
                last_x = relative_x_left + ITEM_WIDTH
            
            inner_width = last_x
            
            left_height = (len(left_col_data) * ITEM_HEIGHT) + (max(0, len(left_col_data) - 1) * ITEM_V_GAP)
            center_height = (len(center_col_data) * ITEM_HEIGHT) + (max(0, len(center_col_data) - 1) * ITEM_V_GAP)
            right_height = (len(right_col_data) * ITEM_HEIGHT) + (max(0, len(right_col_data) - 1) * ITEM_V_GAP)
            inner_height = max(left_height, center_height, right_height)

            # 3. Calculate final ContextBox dimensions
            context_width = inner_width + PADDING
            context_height = inner_height + (2 * PADDING)

            # 4. Add ContextBox item with its global position
            context_id = item_id_counter
            context_global_y = PADDING
            items.append({
                "id": context_id, "type": "ContextBox", "instanceName": context.name,
                "description": context.description, "x": global_x_offset, "y": context_global_y,
                "width": context_width, "height": context_height,
            })
            item_id_counter += 1

            # 5. Add child items with calculated GLOBAL coordinates
            # Left Column
            relative_y = PADDING + (inner_height - left_height) / 2
            for item_type, item_data in left_col_data:
                item_id = item_id_counter
                items.append({
                    "id": item_id, "parent": context_id, "type": item_type, "instanceName": item_data.name,
                    "description": item_data.description,
                    "x": global_x_offset + relative_x_left, "y": context_global_y + relative_y,
                    "width": ITEM_WIDTH, "height": ITEM_HEIGHT
                })
                name_to_id_map[item_data.name] = item_id # Map name to ID
                relative_y += ITEM_HEIGHT + ITEM_V_GAP
                item_id_counter += 1

            # Center Column
            relative_y = PADDING + (inner_height - center_height) / 2
            for item_type, item_data in center_col_data:
                item_id = item_id_counter
                item_entry = {
                    "id": item_id, "parent": context_id, "type": item_type, "instanceName": item_data.name,
                    "description": item_data.description,
                    "x": global_x_offset + relative_x_center, "y": context_global_y + relative_y,
                    "width": AGGREGATE_WIDTH, "height": ITEM_HEIGHT
                }
                if item_type == "Aggregate":
                    item_entry["linkedDiagram"] = f"{_slugify(item_data.name)}-uml"
                items.append(item_entry)
                name_to_id_map[item_data.name] = item_id # Map name to ID
                relative_y += ITEM_HEIGHT + ITEM_V_GAP
                item_id_counter += 1

            # Right Column
            relative_y = PADDING + (inner_height - right_height) / 2
            for item_type, item_data in right_col_data:
                item_id = item_id_counter
                items.append({
                    "id": item_id, "parent": context_id, "type": item_type, "instanceName": item_data.name,
                    "description": item_data.description,
                    "x": global_x_offset + relative_x_right, "y": context_global_y + relative_y,
                    "width": ITEM_WIDTH, "height": ITEM_HEIGHT
                })
                name_to_id_map[item_data.name] = item_id # Map name to ID
                relative_y += ITEM_HEIGHT + ITEM_V_GAP
                item_id_counter += 1

            # 6. Update the global offset for the next context
            global_x_offset += context_width + CONTEXT_H_GAP
            
        # 7. Process connections using the name-to-ID map
        for conn in concepts.connections:
            from_id = name_to_id_map.get(conn.from_name)
            to_id = name_to_id_map.get(conn.to_name)
            if from_id and to_id:
                connections.append({
                    "id": f"conn-{from_id}-{to_id}",
                    "from": from_id,
                    "to": to_id,
                    "type": conn.type
                })
            else:
                logging.warning(f"Could not create connection from '{conn.from_name}' to '{conn.to_name}'. One or both names not found.")

        return {
            "boardType": "Eventstorming",
            "instanceName": board_name,
            "items": items,
            "connections": connections
        }
    else:
        # Handle the case where concepts could not be generated
        return {
            "boardType": "Eventstorming",
            "instanceName": "error-board",
            "items": [{
                "id": 1,
                "type": "Error",
                "instanceName": "Failed to generate concepts",
                "description": "The language model failed to produce a valid set of domain concepts after multiple retries.",
            }],
            "connections": []
        }


class EventstormingAgent:
    """A smart agent that uses an LLM to generate a domain-specific eventstorming board."""

    async def ainvoke(self, description: str) -> str:
        if not description:
            description = f"Generic E-commerce Project {datetime.utcnow().isoformat()}"

        # Use LLM to get domain-specific concepts
        concepts = await _generate_eventstorming_concepts(description)

        # If the LLM fails, return an error structure
        if concepts is None:
            board = {
                "boardType": "Eventstorming",
                "instanceName": "error-board",
                "items": [{
                    "id": 1,
                    "type": "Error",
                    "instanceName": "Failed to generate concepts",
                    "description": "The language model failed to produce a valid set of domain concepts after multiple retries."
                }],
                "connections": []
            }
        else:
            # Build the board from these concepts
            board = _create_eventstorming_board(description, concepts)

        return json.dumps(board, ensure_ascii=False)

    SUPPORTED_CONTENT_TYPES = ['text', 'text/plain']