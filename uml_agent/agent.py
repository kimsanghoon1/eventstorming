import json
import uuid
from datetime import datetime
from langchain_core.pydantic_v1 import BaseModel, Field, parse_obj_as, ValidationError
from langchain_core.messages import AIMessage
from langchain_openai import ChatOpenAI
import os
import logging

logging.basicConfig(level=logging.INFO, encoding='utf-8')

# --- LLM for generating domain-specific content ---
llm = ChatOpenAI(
    api_key=os.getenv('OPENAI_API_KEY'),
    base_url=os.getenv('OPENAI_API_BASE_URL'),
    model=os.getenv('OPENAI_API_MODEL', 'openai/gpt-oss-120b'),
    temperature=0.2,
)

# --- Pydantic Models for UML Generation ---
class UMLAttribute(BaseModel):
    name: str = Field(description="Attribute name (camelCase).")
    type: str = Field(description="Attribute type (e.g., 'String', 'UUID', 'Money', 'List<OrderItem>'). Use domain primitives where possible.")
    visibility: str = Field(default="private", description="Visibility (e.g., 'private', 'public').")

class UMLParameter(BaseModel):
    name: str = Field(description="Parameter name (camelCase).")
    type: str = Field(description="Parameter type.")

class UMLMethod(BaseModel):
    name: str = Field(description="Method name (camelCase).")
    parameters: list[UMLParameter] = Field(default_factory=list, description="List of parameters.")
    returnType: str = Field(description="Return type (e.g., 'void', 'boolean', 'Order').")
    visibility: str = Field(default="public", description="Visibility (e.g., 'public').")

class UMLClass(BaseModel):
    name: str = Field(description="Name of the class in PascalCase (e.g., 'Order', 'ShippingAddress').")
    stereotype: str = Field(description="Stereotype (e.g., 'AggregateRoot', 'Entity', 'ValueObject', 'Enum').")
    attributes: list[UMLAttribute] = Field(default_factory=list, description="List of attributes.")
    methods: list[UMLMethod] = Field(default_factory=list, description="List of methods.")
    enumValues: list[str] = Field(default_factory=list, description="List of enum values (e.g., 'PENDING', 'SHIPPED') if stereotype is Enum.")

class UMLRelationship(BaseModel):
    source: str = Field(description="Name of the source class.")
    target: str = Field(description="Name of the target class.")
    type: str = Field(description="Type of relationship: 'Association', 'Composition', 'Aggregation', 'Generalization', 'Dependency'.")
    sourceMultiplicity: str = Field(default="", description="Multiplicity at source (e.g., '1', '0..1').")
    targetMultiplicity: str = Field(default="", description="Multiplicity at target (e.g., '1', '0..*', '*').")

class UMLConcepts(BaseModel):
    """The detailed classes and relationships for a UML diagram based on a Bounded Context."""
    classes: list[UMLClass]
    relationships: list[UMLRelationship] = Field(default_factory=list, description="List of relationships between classes.")

async def _generate_uml_concepts(eventstorming_context: dict) -> UMLConcepts | None:
    context_data = eventstorming_context # Renamed for clarity in prompt
    prompt = f"""
    You are an expert software architect and UML designer.
    Your goal is to generate a detailed Domain-Driven Design (DDD) UML class diagram based on the following Eventstorming context.

    **Context Description:**
    Project: {context_data.get('project_name')}
    Context: {context_data.get('context_name')}
    Description: {context_data.get('context_description')}

    **Items in Context:**
    {json.dumps(context_data.get('items', []), indent=2, ensure_ascii=False)}

    **Instructions:**
    1.  **Identify Classes**: Create UML classes for all Aggregates, Entities, Value Objects, Enums, Commands, Events, Policies, and **Read Models**.
        *   **Naming**: Use **PascalCase** (e.g., `Order`, `ShippingAddress`).
        *   **Korean Handling**: Translate Korean names into meaningful English names.
    2.  **Stereotypes & Roles (CRITICAL for Code Generation)**:
        *   `AggregateRoot`: The main domain object. **Contains business logic methods.**
        *   `Entity`: Internal entities.
        *   `ValueObject`: Immutable objects (e.g., `Address`, `Money`).
        *   `Enum`: Enumerations.
        *   `Command` & `Event`: **Pure Data Transfer Objects (DTOs)**. They must have **Attributes ONLY** and **NO Methods**.
        *   `ReadModel`: **Query-optimized DTO or Entity**. Represents a view of data. Attributes ONLY.
        *   `Service`: Transform 'Policy' items into Domain Services (e.g., `InventoryService`, `PaymentService`). These contain the logic to handle events.
    3.  **Attributes & Methods**:
        *   **Commands/Events/ReadModels**: Add attributes representing the data they carry. **DO NOT add methods like `execute` or `apply`.**
        *   **Aggregates**: Add methods that correspond to handling Commands (e.g., `placeOrder`, `cancel`).
        *   **Services (Policies)**: Add methods that handle Events (e.g., `onOrderPlaced`, `handlePayment`).
        *   **Type Inference**: Use specific types (`UserId`, `Money`) over generic `String`.
        *   **Enums**: Populate `enumValues` list, do NOT add attributes.
    4.  **Relationships**:
        *   **Composition (◇--)**: Aggregate -> Entity/VO.
        *   **Dependency (..>)**: Service -> Event (listens to), Aggregate -> Command (handles).
        *   **Association (-->)**: General linkage.
    5.  **Completeness (CRITICAL)**:
        *   **Connect Everything**: Ensure every Class, Enum, and Value Object is connected.
        *   **Attribute Relationships**: If a class has an attribute of type `X` (e.g., `orderId: OrderId`), and `X` is defined as a Class/Enum in the diagram, you **MUST** create a relationship between them.
        *   **Exceptions**: DO NOT create relationships for primitive types (e.g., `String`, `Integer`, `Boolean`, `Long`, `Date`, `List`, `Map`). Only connect to domain objects.

    **Example Output:**
    ```json
    {{
      "classes": [
        {{ 
            "name": "PlaceOrderCommand", 
            "stereotype": "Command", 
            "attributes": [
                {{ "name": "userId", "type": "UserId" }},
                {{ "name": "cartItems", "type": "List<CartItem>" }}
            ], 
            "methods": [] 
        }},
        {{ 
            "name": "OrderPlacedEvent", 
            "stereotype": "Event", 
            "attributes": [
                {{ "name": "orderId", "type": "OrderId" }}
            ], 
            "methods": [] 
        }},
        {{ 
            "name": "Order", 
            "stereotype": "AggregateRoot", 
            "attributes": [
                {{ "name": "orderId", "type": "OrderId", "visibility": "private" }}
            ], 
            "methods": [
                {{ 
                    "name": "placeOrder", 
                    "returnType": "void", 
                    "visibility": "public", 
                    "parameters": [ {{ "name": "command", "type": "PlaceOrderCommand" }} ]
                }}
            ] 
        }},
        {{ 
            "name": "InventoryService", 
            "stereotype": "Service", 
            "attributes": [], 
            "methods": [
                {{ 
                    "name": "onOrderPlaced", 
                    "returnType": "void", 
                    "parameters": [ {{ "name": "event", "type": "OrderPlacedEvent" }} ]
                }}
            ] 
        }}
      ],
      "relationships": [
        {{ "source": "Order", "target": "PlaceOrderCommand", "type": "Dependency", "targetMultiplicity": "1" }},
        {{ "source": "InventoryService", "target": "OrderPlacedEvent", "type": "Dependency", "targetMultiplicity": "1" }}
      ]
    }}
    ```
    """
    for i in range(3): # Retry up to 3 times
        try:
            raw_response = await llm.ainvoke(prompt)
            logging.info(f"Raw LLM Output for UML concepts (attempt {i+1}):\n{raw_response}")

            # Clean the response: remove markdown fences and strip whitespace
            if isinstance(raw_response, AIMessage):
                cleaned_json_str = raw_response.content.strip()
            else: # Assuming it's a message object with content
                cleaned_json_str = raw_response.content.strip()
            
            if cleaned_json_str.startswith("```json"):
                cleaned_json_str = cleaned_json_str[7:]
            if cleaned_json_str.endswith("```"):
                cleaned_json_str = cleaned_json_str[:-3]
            cleaned_json_str = cleaned_json_str.strip()


            data = json.loads(cleaned_json_str)
            
            # Validate with Pydantic
            validated_concepts = UMLConcepts.parse_obj(data)
            logging.info("Successfully parsed and validated UMLConcepts.")
            return validated_concepts
            
        except (json.JSONDecodeError, Exception) as e:
            logging.error(f"Failed to parse or validate UML LLM response on attempt {i+1}. Error: {e}")
            logging.error(f"Raw response that failed: {raw_response}")
            
    logging.error("LLM failed to generate valid UML concepts after multiple retries.")
    return None


def _slugify(text: str) -> str:
    return ''.join(c if c.isalnum() else '-' for c in text).strip('-').lower() or 'uml-diagram'


def _create_uml_diagram(description: str, concepts: UMLConcepts | None = None, context_data: dict | None = None) -> dict:
    diagram_name = "generated-uml-diagram"
    if context_data:
        # Use context name as default if available
        if "context_name" in context_data:
            diagram_name = f"{_slugify(context_data['context_name'])}-uml"
            
        for item in context_data.get("items", []):
            if item.get("type") == "Aggregate" and item.get("linkedDiagram"):
                diagram_name = item["linkedDiagram"]
                break

    items = []
    connections = []
    
    if concepts and concepts.classes:
        # Simple grid layout
        x_pos, y_pos = 100, 100
        MAX_WIDTH = 1200
        
        name_to_id = {}

        for i, uml_class in enumerate(concepts.classes, start=1):
            item_id = str(uuid.uuid4())
            name_to_id[uml_class.name] = item_id

            uml_item = {
                "id": item_id,
                "type": "Class",
                "instanceName": uml_class.name,
                "stereotype": uml_class.stereotype,
                "description": f"Class for {uml_class.name}.",
                "x": x_pos,
                "y": y_pos,
                "width": 280,
                "height": 220,
                "attributes": [attr.dict() for attr in uml_class.attributes],
                "methods": [meth.dict() for meth in uml_class.methods],
            }
            
            if uml_class.enumValues:
                uml_item["enumValues"] = uml_class.enumValues

            items.append(uml_item)
            
            x_pos += 320
            if x_pos > MAX_WIDTH:
                x_pos = 100
                y_pos += 260
        
        # Generate connections from relationships
        for rel in concepts.relationships:
            source_id = name_to_id.get(rel.source)
            target_id = name_to_id.get(rel.target)
            
            if source_id and target_id:
                connections.append({
                    "id": str(uuid.uuid4()),
                    "from": source_id,
                    "to": target_id,
                    "type": rel.type,
                    "sourceMultiplicity": rel.sourceMultiplicity,
                    "targetMultiplicity": rel.targetMultiplicity
                })
            else:
                logging.warning(f"Could not create relationship {rel.source} -> {rel.target}. Class not found.")

        # --- Orphan Removal Logic ---
        # Identify all IDs involved in connections
        connected_ids = set()
        for conn in connections:
            connected_ids.add(conn["from"])
            connected_ids.add(conn["to"])

        # Filter out disconnected ValueObjects and Enums
        filtered_items = []
        for item in items:
            # Keep if connected
            if item["id"] in connected_ids:
                filtered_items.append(item)
            # Keep if NOT ValueObject or Enum (e.g. Aggregate, Command, Event should stay even if disconnected, though ideally they are connected)
            # User specifically asked about "ENUM or VO", so we target those for removal.
            elif item.get("stereotype") not in ["ValueObject", "Enum"]:
                filtered_items.append(item)
            else:
                logging.info(f"Removing disconnected orphan item: {item['instanceName']} ({item.get('stereotype')})")
        
        items = filtered_items
        # -----------------------------

    if not items:
        items.append({
            "id": str(uuid.uuid4()),
            "type": "Class",
            "instanceName": "FallbackAggregate",
            "stereotype": "AggregateRoot",
            "description": "Fallback: The UML generator could not infer specific classes.",
            "x": 100,
            "y": 100,
            "width": 280,
            "height": 220,
            "attributes": [],
            "methods": [],
            "relationships": []
        })

    return {
        "boardType": "UML",
        "instanceName": diagram_name,
        "items": items,
        "connections": connections
    }


class UmlAgent:
    """A smart agent that generates a domain-specific UML diagram from an Eventstorming context."""

    async def ainvoke(self, payload: str) -> str:
        """
        Generates a UML diagram from a JSON string payload containing eventstorming context.
        """
        description = f"Generated UML Diagram {datetime.utcnow().isoformat()}"
        context_data: dict | None = None
        
        try:
            # The entire payload is the context data from the orchestrator
            context_data = json.loads(payload)
        except (json.JSONDecodeError, TypeError) as e:
            logging.error(f"Failed to parse payload as JSON: {e}. Payload: {payload[:500]}")
            # If payload is not a valid JSON, we cannot proceed with concept generation.
            board = _create_uml_diagram(description, None, None)
            return json.dumps(board, ensure_ascii=False)

        # Generate detailed UML concepts from the parsed context
        concepts = await _generate_uml_concepts(context_data)
        
        # Create the final diagram using the concepts and context data
        board = _create_uml_diagram(description, concepts, context_data)

        return json.dumps(board, ensure_ascii=False)

    SUPPORTED_CONTENT_TYPES = ['text', 'text/plain']