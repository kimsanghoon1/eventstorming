import json
import uuid
from datetime import datetime
from typing import Any
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
    model=os.getenv('OPENAI_API_MODEL', 'openai/gpt-oss-120b'),
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

class DomainReadModel(BaseModel):
    name: str = Field(description="Name of the read model/projection, e.g., 'OrderSummaryReadModel'.")
    description: str = Field(description="A brief description of the data this read model exposes and why it exists.")
    fields: list[str] | None = Field(default_factory=list, description="Optional list of key fields/attributes exposed by this read model.")

class DomainConnection(BaseModel):
    from_name: str = Field(description="The name of the source item, which is typically an Event.")
    to_name: str = Field(description="The name of the target item (Command, Policy, or ReadModel) in another context.")
    type: str = Field(default="Flow", description="The type of connection (e.g., 'Flow', 'RequestResponse').")

class BoundedContext(BaseModel):
    name: str = Field(description="Name of the bounded context, e.g., 'Order Management' or 'User Accounts'")
    description: str = Field(description="A brief description of the context's responsibilities.")
    events: list[DomainEvent] = Field(description="List of key domain events within this context.")
    commands: list[DomainCommand] = Field(description="List of key domain commands within this context.")
    policies: list[DomainPolicy] = Field(description="List of key domain policies within this context.")
    aggregates: list[DomainAggregate] = Field(description="List of key domain aggregates within this context.")
    readModels: list[DomainReadModel] = Field(default_factory=list, description="List of read models/projections (primarily for CQRS/read contexts).")


class EventstormingConcepts(BaseModel):
    """A list of key concepts identified during an Eventstorming session, organized by Bounded Context."""
    project_name: str = Field(description="A short, descriptive, slug-friendly name for the project, e.g., 'OnlineShoppingCart' or 'UserAuthentication'.")
    contexts: list[BoundedContext] = Field(description="List of bounded contexts identified for the microservice architecture.")
    connections: list[DomainConnection] = Field(description="A list of connections between items across different contexts.")


def _ensure_list(value, default=None):
    if isinstance(value, list):
        return value
    if value is None:
        return [] if default is None else default
    return [value]


def _normalize_generated_payload(payload: Any) -> Any:
    """Best-effort fix-up for LLM responses missing required arrays/fields."""
    if not isinstance(payload, dict):
        return payload

    payload.setdefault("project_name", payload.get("project_name") or "generated-project")

    contexts = payload.get("contexts")
    contexts = _ensure_list(contexts)
    normalized_contexts = []
    for ctx in contexts:
        if not isinstance(ctx, dict):
            continue
        ctx.setdefault("name", ctx.get("name") or "UnnamedContext")
        ctx.setdefault("description", ctx.get("description") or "")
        ctx["events"] = _ensure_list(ctx.get("events"))
        ctx["commands"] = _ensure_list(ctx.get("commands"))
        ctx["policies"] = _ensure_list(ctx.get("policies"))
        ctx["aggregates"] = _ensure_list(ctx.get("aggregates"))
        ctx["readModels"] = _ensure_list(ctx.get("readModels"))
        normalized_contexts.append(ctx)
    payload["contexts"] = normalized_contexts

    connections = payload.get("connections")
    connections = _ensure_list(connections)
    for conn in connections:
        if isinstance(conn, dict):
            conn.setdefault("type", conn.get("type") or "Flow")
    payload["connections"] = connections

    return payload


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
        *   `commands`: Actions that trigger changes to aggregates (e.g., "RegisterUser", "PlaceOrder"). Commands represent synchronous behaviors inside the bounded context (UI/API/RPC style).
            *   **Korean Nuance**: If the user action implies changing state (e.g., "신청", "등록", "수정", "취소", "결제"), model it as a **Command**.
            *   **Produced Event (CRITICAL)**: You MUST specify the `produced_event_name` if this command triggers a domain event. For example, if "PlaceOrder" triggers "OrderPlaced", set `produced_event_name` to "OrderPlaced".
        *   `events`: The outcomes or results of commands (e.g., "UserRegistered", "OrderPlaced").
        *   `policies`: Reactions to events, often triggering commands in other contexts (e.g., "SendWelcomeEmail"). Policies represent asynchronous handlers (message listeners, subscribers). Whenever the user asks for asynchronous service-to-service communication, ensure the reacting side is modeled as a policy, not a command. For **every** asynchronous hop identified later, create a dedicated Policy entry in the consumer context.
            *   **Naming**: Avoid generic names like "HandleEventPolicy". Use descriptive action names like "SendConfirmationEmail", "DeductInventory", "UpdateSalesReport". Do not include the literal word "정책" (or "policy") inside the policy name.
            *   **Produced Event (CRITICAL)**: You MUST specify the `produced_event_name` if this policy results in a new event. For example, if "ProcessPayment" triggers "PaymentProcessed", set `produced_event_name` to "PaymentProcessed".
        *   `readModels` (for CQRS/query contexts): Projections that expose query-ready data.
            *   **Korean Nuance**: If the user action implies retrieving data without changing state (e.g., "조회", "확인", "보기", "검색", "통계", "리포트"), model it as a **ReadModel**. Do NOT model queries as Commands.
            *   **Reporting/View Contexts**: If a context is described as "Reporting", "Dashboard", "Admin View", or "Statistics", it MUST contain **ReadModels**. For example, `DailySalesReport` instead of `GenerateReportPolicy`.
            *   **ReadModel은 반드시 `readModels` 리스트에 포함되어야 하며, 절대 `aggregates`나 `commands`에 포함되어서는 안 된다.**

    3.  **Map Service Interaction Flow**: Parse every described process flow or call sequence (e.g., "안내 → 조회 → 신청 → 연계 → 발급 → 알림") and convert it into explicit interactions:
        *   For each hop, identify the triggering Event and the consumer. Define what data/result is passed along and whether the next step waits for a response.
        *   When the user states that the outcome of a call controls the next step (e.g., “민원 신청에서 민원 연계 결과에 따라 민원 발급 진행”), model separate events/policies for success vs. failure so the branching is explicit.
        *   Mirror the narrative order verbatim. If the user enumerates “민원 안내 → 민원 조회 → …”, preserve that order in the resulting interactions so stakeholders can trace the original story easily.
        *   Create a mini interaction matrix: “Producer Event → Consumer Handler” for every pair of services described. This ensures no implicit link is missed.
        *   **Context-Specific Instructions**: When the user explicitly names a bounded context/service and requests an addition or modification inside it (e.g., “결과조회 컨텍스트에 ReadModel을 추가해줘”), locate the matching context (existing board data first, then newly defined contexts) and apply the change there. Do **not** create a new context unless the user clearly introduces a brand-new service.
    4.  **Classify Interaction Style**: Based on the mapped flow, determine whether each interaction is synchronous or asynchronous.
        *   If the user states anything like “서비스 간 호출은 비동기”, “async only”, “이벤트 기반 통신”, “non-blocking”, or “publish/subscribe”, assume **all cross-context flows are asynchronous** unless the user makes an explicit exception for a specific interaction (e.g., “연계만 동기로 처리”).
        *   If the user explicitly calls out synchronous behavior (e.g., “동기로 호출”, “RPC”, “blocking call”), treat only that specific interaction as synchronous.
        *   Document your interpretation by ensuring the generated connections follow the inferred interaction mode. If the user insists on asynchronous communications, be prepared to transform previously planned Commands into Policies before finalizing the JSON. **Do not leave any asynchronous interaction represented as a Command.**
        *   **CQRS-Specific Rule**: When the user mentions CQRS, Query Service, 읽기 전용 서비스, 보고/조회 전용 API, View Model, Projection 등과 같은 표현을 사용하면, 해당 컨텍스트를 CQRS/read side로 모델링한다. 이러한 컨텍스트에는 최소 하나 이상의 `ReadModel` 항목이 반드시 포함되어야 하며, 사용자가 구체적인 이름을 제공하지 않더라도 의미 있는 읽기 모델 이름(예: `OrderSummaryReadModel`, `CustomerProfileView`)을 직접 설계한다. ReadModel 객체에는 어떤 데이터를 제공하는지 명확한 설명을 포함하고, 필요한 경우 관련 속성/필드를 `fields`나 `description`으로 서술한다.
        *   For each asynchronous hop, ensure the consumer context has a Policy item dedicated to that action, and the connection is `Event -> Policy`.
        *   For each synchronous hop, ensure the consumer context has a Command item, and the connection is `Event -> Command`.
    5.  **Structure the JSON**: Create a JSON object with a `project_name` and a list of `contexts`. Each context object in the list must contain its `name`, `description`, and lists for `aggregates`, `commands`, `events`, `policies`, and, whenever applicable, `readModels` for CQRS contexts. **Never leave the `readModels` list empty if the context is meant to serve queries; populate it with at least one well-defined ReadModel, and ensure any user-specified “컨텍스트 X에 ReadModel 추가” 요청은 반드시 해당 컨텍스트 내부에 반영된다.**
    6.  **CRITICAL - Generate Connections**: After defining all contexts and their items, meticulously analyze the relationships BETWEEN contexts. Create a `connections` list at the root of the JSON object. Every connection must be semantically aligned with the interaction style identified earlier and must map 1:1 with the flow you documented in Step 3.
    *   **Rule 1**: Connections MUST originate from an `Event` in one context.
    *   **Rule 2**: Connections MUST target a `Command`, `Policy`, or (for CQRS queries) a `ReadModel` in a DIFFERENT context.
    *   **Rule 2-1 (Sync vs Async)**:
        *   If the downstream interaction is synchronous (e.g., the source context requires an immediate operation in another bounded context), create an `Event -> Command` connection to represent the synchronous call. **Only do this for interactions explicitly labeled as synchronous/RPC/blocking in the user request.**
        *   If the downstream interaction is asynchronous or fire-and-forget (e.g., publish/subscribe, eventual consistency reactions), create an `Event -> Policy` connection. Policies may in turn describe how they emit commands internally, but the cross-context connection itself should be `Event -> Policy`. **Do not allow any asynchronous interaction to remain as `Event -> Command`; convert those commands into policies with descriptive behavior names.**
        *   **CQRS Request/Response**: Whenever a service calls a CQRS/read-model service (e.g., querying a projection), treat it as a synchronous request/response. Model that call as `Event -> ReadModel`, set the connection’s `type` to `"RequestResponse"`, and ensure the target CQRS context contains the relevant `ReadModel` that returns the requested data. Do not route such calls through Commands or Policies—connect directly to the ReadModel to emphasize the query nature.
        *   **User Intent Override**: When the user explicitly states that service-to-service communication should be asynchronous (phrases like “서비스 간 호출은 비동기”, “event-driven only”, “publish/subscribe”), default every cross-context connection to `Event -> Policy` unless the user clearly marks an interaction as synchronous/blocking/RPC. In other words:
            *   Treat “비동기” requests as a blanket rule—**do not** output `Event -> Command` anywhere unless the user carves out a specific synchronous exception.
            *   If the user gives examples like “서비스 A는 서비스 B를 동기로 호출한다” while also saying “다른 호출은 비동기”, respect that nuance: only the described synchronous call should be `Event -> Command`; all others stay `Event -> Policy`. When converting, rename the target to a descriptive async handler name that omits words like “정책/policy”.
        *   When you convert an interaction to `Event -> Policy`, you may mention inside the policy description which command it eventually triggers, but the cross-context edge remains `Event -> Policy`.
    *   **Rule 3**: NEVER create connections between two events (Event -> Event is forbidden).
    *   **Rule 4**: NEVER create connections between items within the SAME context. Connections represent inter-service communication only.
    *   **Rule 5**: If a policy needs to react to its own context's event, describe that behavior inside the policy but DO NOT create a connection line. Only cross-context interactions get connections.
    *   For each connection, specify `from_name` (the event's name) and `to_name` (the target item’s name). Make sure ReadModel targets are explicitly labeled and use `"type": "RequestResponse"`.

    8.  **Layout & Consistency (CRITICAL)**
    *   **Preserve Existing Items**: If the user request is an update to an existing model, you MUST preserve the exact names of existing Contexts, Commands, Aggregates, Events, Policies, and ReadModels unless explicitly asked to rename or delete them.
    *   **Reasoning**: The system uses these names to map new data to existing coordinates on the canvas. Changing a name slightly (e.g., "OrderContext" -> "OrderManagementContext") will cause the item to lose its position and reset to a default location, destroying the user's manual layout.
    *   **New Items**: Only new items should be added. Do not regenerate the entire list if it's not necessary.
    *   **Coordinates**: While you do not output coordinates directly, your output determines whether the system can link back to existing items. Accuracy in naming is paramount for layout stability.

    9.  **Validation & Auto-Correction (Do NOT skip this step)**  
    Before returning the JSON:
    *   Re-scan the user request for phrases like “비동기”, “async only”, “비동기 서비스 호출”, “이벤트 기반”. If present (and no contrary exception exists), ensure **all cross-context targets are Policies**, not Commands. Convert any remaining asynchronous Commands into Policies (with descriptive, non-“정책/policy” names) and update the connections to `Event -> Policy`.
    *   Verify that every CQRS/read-only bounded context contains at least one ReadModel. If any such context is missing a ReadModel, add one immediately (with a meaningful name and description).
    *   Confirm that all CQRS query connections are `Event -> ReadModel` with `"type": "RequestResponse"`. No intermediate Command/Policy should stand between the Event and the ReadModel.
    *   Respect existing coordinates when provided. Do not move current items. For new items, place them near their related context while ensuring coordinates do not overlap existing items (slight offsets are acceptable if needed to avoid collisions).
        *   Re-read the user instructions for phrases like “<ContextName>에 <개체> 추가/수정”. Ensure that each named context exists and now contains the requested ReadModel/Policy/Command. If a context name was provided but missing, create it and document why.

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
      "name": "ReportingContext",
      "description": "Provides reports and statistics.",
      "aggregates": [],
      "commands": [],
      "events": [],
      "policies": [{{"name": "UpdateDailySales", "description": "Updates sales figures when order is placed."}}],
      "readModels": [{{"name": "DailySalesReport", "description": "Daily sales summary.", "fields": ["date", "totalSales", "orderCount"]}}]
    }}
  ],
  "connections": [
    {{
      "from_name": "UserRegistered",
      "to_name": "SendWelcomeEmail",
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
            
            # Manually parse the JSON, normalize missing collections, and validate with Pydantic
            data = json.loads(clean_json_str)
            normalized = _normalize_generated_payload(data)
            concepts = EventstormingConcepts.parse_obj(normalized)
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


BASE_ITEM_DIMENSIONS = {
    "default": {"width": 220, "height": 100},
    "Command": {"width": 230, "height": 110},
    "Event": {"width": 210, "height": 90},
    "Policy": {"width": 250, "height": 130},
    "Aggregate": {"width": 260, "height": 140},
    "Actor": {"width": 200, "height": 90},
    "ReadModel": {"width": 250, "height": 140},
}
MIN_ITEM_WIDTH = 140
MAX_ITEM_WIDTH = 460
MIN_ITEM_HEIGHT = 80
MAX_ITEM_HEIGHT = 260


def compute_item_dimensions(item_type: str, data: dict) -> tuple[int, int]:
    base = BASE_ITEM_DIMENSIONS.get(item_type, BASE_ITEM_DIMENSIONS["default"]).copy()
    width = base["width"]
    height = base["height"]

    name = data.get("instanceName") or data.get("name") or ""
    description = data.get("description") or ""

    if name:
        width = max(width, min(MAX_ITEM_WIDTH, MIN_ITEM_WIDTH + len(name) * 9))
    if description:
        extra_lines = (len(description) // 40) + 1
        height += extra_lines * 14

    attribute_count = len(data.get("attributes") or [])
    property_count = len(data.get("properties") or [])
    method_count = len(data.get("methods") or [])
    enum_count = len(data.get("enumValues") or [])
    height += min(80, (attribute_count + property_count + method_count + enum_count) * 6)

    width = max(MIN_ITEM_WIDTH, min(MAX_ITEM_WIDTH, width))
    height = max(MIN_ITEM_HEIGHT, min(MAX_ITEM_HEIGHT, height))
    return int(width), int(height)

def _create_eventstorming_board(description: str, concepts: EventstormingConcepts, existing_board: dict | None = None) -> dict:
    import requests
    api_base = "http://localhost:3000/api"
    
    # 1. Create or Identify Board
    board_id = str(uuid.uuid4())
    board_name = _slugify(concepts.project_name)
    
    # Check if we can use an existing board ID from existing_board
    if existing_board and "id" in existing_board:
        board_id = existing_board["id"]
        logging.info(f"Using existing board ID: {board_id}")
    else:
        # Create new board via API (optional, but good for consistency)
        # For now, we'll just generate the ID and let the items create the board association implicitly
        # or we can assume the board exists if we are updating.
        # If we are creating from scratch, we might want to call create-empty.
        pass

    logging.info(f"Creating/Updating board: {board_id} ({board_name})")

    # 2. Layout Parameters
    x_pos = 100
    y_pos = 100
    x_gap = 250
    y_gap = 150
    
    current_x = x_pos
    current_y = y_pos

    items = []
    connections = []

    # 3. Process Contexts and Create Items
    for context in concepts.contexts:
        logging.info(f"Processing context: {context.name}")
        
        # Process each type of element
        elements = []
        for cmd in context.commands: elements.append(('COMMAND', cmd))
        for agg in context.aggregates: elements.append(('AGGREGATE', agg))
        for evt in context.events: elements.append(('EVENT', evt))
        for pol in context.policies: elements.append(('POLICY', pol))
        for rm in context.readModels: elements.append(('READ_MODEL', rm))

        for type_name, item in elements:
            try:
                # A. Create DomainObject
                domain_payload = {
                    "type": type_name,
                    "instanceName": item.name,
                    "description": item.description,
                    "properties": "{}" 
                }
                
                # Try to create domain object
                try:
                    domain_resp = requests.post(f"{api_base}/domain", json=domain_payload)
                    domain_resp.raise_for_status()
                    domain_obj = domain_resp.json()
                    domain_id = domain_obj['id']
                except Exception as e:
                    logging.error(f"Failed to create domain object {item.name}: {e}")
                    continue

                # B. Create CanvasItem
                canvas_payload = {
                    "boardId": board_id,
                    "domainObjectId": domain_id,
                    "x": current_x,
                    "y": current_y,
                    "width": 120,
                    "height": 60
                }
                
                try:
                    canvas_resp = requests.post(f"{api_base}/canvas-items", json=canvas_payload)
                    canvas_resp.raise_for_status()
                    canvas_item = canvas_resp.json()
                    
                    # Add to local list for return value (legacy support)
                    items.append({
                        "id": canvas_item.get("id"),
                        "type": type_name, # Frontend expects specific types
                        "instanceName": item.name,
                        "x": current_x,
                        "y": current_y,
                        "domainObjectId": domain_id
                    })
                except Exception as e:
                    logging.error(f"Failed to create canvas item for {item.name}: {e}")

                # Update position
                current_x += x_gap
                if current_x > 1500:
                    current_x = x_pos
                    current_y += y_gap
                    
            except Exception as e:
                logging.error(f"Error processing item {item.name}: {e}")

        # New row for next context
        current_x = x_pos
        current_y += y_gap + 50

    return {
        "id": board_id,
        "boardType": "Eventstorming",
        "instanceName": board_name,
        "items": items,
        "connections": connections
    }

def _infer_produced_event(item_name: str, context_events: list[dict]) -> dict | None:
    """
    Heuristic to find the event produced by a command or policy.
    e.g. "RegisterUser" -> "UserRegistered"
         "PlaceOrder" -> "OrderPlaced"
    """
    normalized_item = item_name.lower().replace(" ", "")
    
    for event in context_events:
        event_name = event["instanceName"]
        normalized_event = event_name.lower().replace(" ", "")
        
        # 1. Check if Event name is contained in Command name or vice versa (simple substring)
        # But "UserRegistered" contains "User", "RegisterUser" contains "User".
        # Better: Check if the "Verb" part matches.
        
        # Common patterns:
        # Command: Verb + Noun (Register User) -> Event: Noun + Verb + ed (User Registered)
        
        # Let's try a specific pattern match for "Command -> Event"
        # If Command is "RegisterUser", Event "UserRegistered" is a strong match.
        
        # Check if Event name starts with the Noun of the Command? Hard to know which is noun.
        
        # Let's try: If Event name is roughly a permutation of Command name + "ed" or "d"
        # Or just check if they are "similar enough"
        
        # Specific check for "UserRegistered" vs "RegisterUser"
        if "register" in normalized_item and "registered" in normalized_event:
            return event
        if "place" in normalized_item and "placed" in normalized_event:
            return event
        if "create" in normalized_item and "created" in normalized_event:
            return event
        if "update" in normalized_item and "updated" in normalized_event:
            return event
        if "delete" in normalized_item and "deleted" in normalized_event:
            return event
        if "cancel" in normalized_item and "cancelled" in normalized_event:
            return event
        if "send" in normalized_item and "sent" in normalized_event:
            return event
        if "pay" in normalized_item and "paid" in normalized_event:
            return event
            
    return None

def _adjust_board_layout(items: list[dict]) -> list[dict]:
    """
    Post-processing to ensure all items are contained within their parent ContextBox.
    If items are detached (completely outside), snap them back inside.
    If items are sticking out, expand the ContextBox.
    """
    PADDING = 50
    ITEM_V_GAP = 30
    
    # Index items by ID and find children map
    item_map = {item["id"]: item for item in items}
    children_map = {}
    contexts = []
    
    for item in items:
        if item["type"] == "ContextBox":
            contexts.append(item)
            children_map[item["id"]] = []
    
    for item in items:
        parent_id = item.get("parent")
        if parent_id and parent_id in children_map:
            children_map[parent_id].append(item)
            
    for context in contexts:
        children = children_map.get(context["id"], [])
        if not children:
            continue
            
        ctx_x = context["x"]
        ctx_y = context["y"]
        ctx_w = context["width"]
        ctx_h = context["height"]
        ctx_right = ctx_x + ctx_w
        ctx_bottom = ctx_y + ctx_h
        
        # Check each child
        detached_children = []
        
        for child in children:
            ch_x = child["x"]
            ch_y = child["y"]
            ch_w = child["width"]
            ch_h = child["height"]
            ch_right = ch_x + ch_w
            ch_bottom = ch_y + ch_h
            
            # Check if completely outside (detached)
            is_outside_x = ch_right < ctx_x or ch_x > ctx_right
            is_outside_y = ch_bottom < ctx_y or ch_y > ctx_bottom
            
            if is_outside_x or is_outside_y:
                detached_children.append(child)
            else:
                # Partially inside, ensure context grows to fit
                if ch_x < ctx_x:
                    diff = ctx_x - ch_x
                    context["x"] -= diff
                    context["width"] += diff
                    ctx_x = context["x"]
                if ch_y < ctx_y:
                    diff = ctx_y - ch_y
                    context["y"] -= diff
                    context["height"] += diff
                    ctx_y = context["y"]
                if ch_right > ctx_x + context["width"]:
                    context["width"] = ch_right - ctx_x + PADDING
                if ch_bottom > ctx_y + context["height"]:
                    context["height"] = ch_bottom - ctx_y + PADDING
                    
        # Fix detached children by stacking them inside the context
        if detached_children:
            logging.warning(f"Context '{context['instanceName']}' has {len(detached_children)} detached children. Snapping them back.")
            
            # Sort by type to keep some order (Command -> Aggregate -> Event/ReadModel)
            type_order = {"Command": 0, "Policy": 1, "Aggregate": 2, "Event": 3, "ReadModel": 4}
            detached_children.sort(key=lambda x: type_order.get(x["type"], 99))
            
            # Place them in a simple column starting at PADDING
            current_y = ctx_y + PADDING
            # Find a free Y slot (below existing attached children?)
            # Simple approach: just stack them at the bottom of the current context height
            current_y = ctx_y + context["height"] - PADDING # Start appending at bottom
            
            for child in detached_children:
                child["x"] = ctx_x + PADDING
                child["y"] = current_y
                
                # Expand context height to fit this new item
                context["height"] += child["height"] + ITEM_V_GAP
                current_y += child["height"] + ITEM_V_GAP
                
    return items


class EventstormingAgent:
    """A smart agent that uses an LLM to generate a domain-specific eventstorming board."""

    async def ainvoke(self, description: str, existing_board: dict | None = None) -> str:
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
                    "id": str(uuid.uuid4()),
                    "type": "Error",
                    "instanceName": "Failed to generate concepts",
                    "description": "The language model failed to produce a valid set of domain concepts after multiple retries."
                }],
                "connections": []
            }
        else:
            # Build the board from these concepts
            board = _create_eventstorming_board(description, concepts, existing_board)

        return json.dumps(board, ensure_ascii=False)

    SUPPORTED_CONTENT_TYPES = ['text', 'text/plain']