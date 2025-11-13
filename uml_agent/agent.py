import json
from datetime import datetime
from langchain_core.pydantic_v1 import BaseModel, Field, parse_obj_as, ValidationError
from langchain_openai import ChatOpenAI
import os
import logging

logging.basicConfig(level=logging.INFO, encoding='utf-8')

# --- LLM for generating domain-specific content ---
llm = ChatOpenAI(
    api_key=os.getenv('OPENAI_API_KEY'),
    base_url=os.getenv('OPENAI_API_BASE_URL'),
    model=os.getenv('OPENAI_API_MODEL'),
    temperature=0.2,
)

# --- Pydantic Models for UML Generation ---
class UMLAttribute(BaseModel):
    name: str = Field(description="Attribute name.")
    type: str = Field(description="Attribute type (e.g., 'String', 'UUID', 'List<OrderItem>').")
    visibility: str = Field(description="Visibility (e.g., 'private', 'public').")

class UMLParameter(BaseModel):
    name: str = Field(description="Parameter name.")
    type: str = Field(description="Parameter type.")

class UMLMethod(BaseModel):
    name: str = Field(description="Method name.")
    parameters: list[UMLParameter] = Field(description="List of parameters, each with a name and type.")
    returnType: str = Field(description="Return type (e.g., 'void', 'boolean').")
    visibility: str = Field(description="Visibility (e.g., 'public').")

class UMLClass(BaseModel):
    name: str = Field(description="Name of the class, typically an Aggregate or Entity.")
    stereotype: str = Field(description="Stereotype (e.g., 'AggregateRoot', 'Entity', 'ValueObject').")
    attributes: list[UMLAttribute]
    methods: list[UMLMethod]

class UMLConcepts(BaseModel):
    """The detailed classes for a UML diagram based on a Bounded Context."""
    classes: list[UMLClass]

async def _generate_uml_concepts(eventstorming_context: dict) -> UMLConcepts | None:
    context_str = json.dumps(eventstorming_context, indent=2)
    prompt = f"""
You are an expert software architect specializing in Domain-Driven Design (DDD).
Your task is to design the detailed classes for a UML diagram based on a single Bounded Context from an Eventstorming session.
Your response MUST be a valid JSON object containing a 'classes' list, enclosed in a single JSON code block.

**Eventstorming Bounded Context:**
```json
{context_str}
```

**Instructions:**
1.  **Analyze the Aggregate(s):** Each aggregate will become a primary class with the stereotype 'AggregateRoot'.
2.  **Translate Commands to Methods:** Convert each command into a public method on its corresponding `AggregateRoot`. The method name should be a camelCase or snake_case version of the command name (e.g., "Place Order" becomes "placeOrder"). The parameters of the method should be inferred from the command's context and expected data.
3.  **Infer Attributes from Events:** Use the events to determine the necessary attributes for the aggregates. For instance, an 'OrderPlaced' event containing `orderId`, `customerId`, and `items` implies that the 'Order' aggregate must have these as private attributes.
4.  **Define Data Types:** Infer appropriate data types for attributes (e.g., 'String', 'UUID', 'List<Item>', 'Money').
5.  **Structure the Output:** For each class, define its `name`, `stereotype`, a list of `attributes` (with name, type, visibility), and a list of `methods` (with name, parameters, returnType, visibility). Each parameter in the `methods` list must be an object with `name` and `type`.

**Example:**
- If a Command is "Register User" and an Event is "User Registered" with `userId` and `email`,
- The 'User' AggregateRoot class should have a `registerUser()` method and private attributes `userId` and `email`.
"""
    for i in range(3): # Retry up to 3 times
        try:
            raw_response = await llm.ainvoke(prompt)
            logging.info(f"Raw LLM Output for UML concepts (attempt {i+1}):\n{raw_response}")

            # Clean the response: remove markdown fences and strip whitespace
            if isinstance(raw_response, str):
                cleaned_json_str = raw_response.strip()
                if cleaned_json_str.startswith("```json"):
                    cleaned_json_str = cleaned_json_str[7:]
                if cleaned_json_str.endswith("```"):
                    cleaned_json_str = cleaned_json_str[:-3]
                cleaned_json_str = cleaned_json_str.strip()
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
            logging.warning(f"Failed to parse or validate UML LLM response on attempt {i+1}. Error: {e}")
            
    logging.error("LLM failed to generate valid UML concepts after multiple retries.")
    return None


def _slugify(text: str) -> str:
    return ''.join(c if c.isalnum() else '-' for c in text).strip('-').lower() or 'uml-diagram'


def _create_uml_diagram(description: str, concepts: UMLConcepts | None = None, context_data: dict | None = None) -> dict:
    diagram_name = "generated-uml-diagram"
    if context_data:
        for item in context_data.get("items", []):
            if item.get("type") == "Aggregate" and item.get("linkedDiagram"):
                diagram_name = item["linkedDiagram"]
                break

    items = []
    connections = []
    
    if concepts and concepts.classes:
        x_pos, y_pos = 100, 100
        for i, uml_class in enumerate(concepts.classes):
            items.append({
                "id": i + 1,
                "type": "Class",
                "instanceName": uml_class.name,
                "stereotype": uml_class.stereotype,
                "description": f"Class for {uml_class.name} aggregate.",
                "x": x_pos, "y": y_pos, "width": 280, "height": 220,
                "attributes": [attr.dict() for attr in uml_class.attributes],
                "methods": [meth.dict() for meth in uml_class.methods],
            })
            x_pos += 320
            if x_pos > 1000:
                x_pos = 100
                y_pos += 260
        else:
        # Fallback to a generic item if LLM fails
            items.append({
                "id": 1, "type": "Class", "instanceName": "DefaultAggregate",
                "description": "Fallback: Could not generate specific classes.", "x": 100, "y": 100,
            })

    # Basic connections between generated classes
    for i in range(len(items) - 1):
        connections.append({
            "id": f"conn-{i+1}-{i+2}", "from": i + 1, "to": i + 2, "type": "Association",
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