import asyncio
import uuid
import httpx
import json
import logging
from pathlib import Path

# Basic logging setup
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# Configuration for the orchestrator agent
AGENT_URL = "http://localhost:10007/" # The single entry point for all complex tasks


def _slugify(text: str | None) -> str:
    if not text:
        return "generated-board"
    return ''.join(c if c.isalnum() else '-' for c in text).strip('-').lower() or "generated-board"

async def run_orchestration_test():
    """Sends a complex modeling request to the orchestrator agent and saves the results."""
    async with httpx.AsyncClient(timeout=600.0) as client:
        # A more detailed user query for microservice architecture
        user_query = "I want to model a microservice architecture for an online shopping mall. The system should include services for user management (registration, login), product catalog (viewing products, categories), and order management (placing orders, viewing order history)."
        
        payload = {
            "jsonrpc": "2.0",
            "id": str(uuid.uuid4()),
            "method": "message/send",
            "params": {
                "message": {
                    "role": "user",
                    "parts": [{"kind": "text", "text": user_query, "content_type": "text/plain"}],
                    "messageId": uuid.uuid4().hex,
                },
                "skill": "orchestrate_modeling_workflow" # The orchestrator's main skill
            }
        }

        try:
            logging.info("--- Starting Intelligent Orchestration Test ---")
            logging.info(f"Sending user query: {user_query}")
            response = await client.post(AGENT_URL, json=payload, timeout=600.0)
            
            if response.status_code == 200:
                logging.info("Request successful. Orchestrator returned a final response.")
                response_data = response.json()
                
                print("\n--- Raw JSON Response ---")
                print(json.dumps(response_data, indent=2))

                # Simplified and corrected parsing logic based on actual response structure
                final_text = None
                result_obj = response_data.get("result", {})
                
                if result_obj:
                    artifacts = result_obj.get("artifacts")
                    if artifacts and isinstance(artifacts, list) and len(artifacts) > 0:
                        parts = artifacts[0].get("parts")
                        if parts and isinstance(parts, list) and len(parts) > 0:
                            final_text = parts[0].get("text")

                if final_text:
                    logging.info("SUCCESS: Orchestrator completed the workflow and provided a final artifact.")
                    
                    try:
                        final_payload = json.loads(final_text)
                    except json.JSONDecodeError as parse_err:
                        logging.error(f"Failed to parse final result as JSON: {parse_err}")
                        final_payload = None

                    if final_payload:
                        try:
                            event_payload = final_payload.get("eventstorming")
                            if isinstance(event_payload, dict):
                                event_dir = Path("data/eventstorming")
                                event_dir.mkdir(parents=True, exist_ok=True)
                                event_filename = _slugify(event_payload.get("instanceName")) + ".json"
                                with (event_dir / event_filename).open("w", encoding="utf-8") as f:
                                    json.dump(event_payload, f, ensure_ascii=False, indent=2)
                                logging.info(f"Saved eventstorming board to {event_dir / event_filename}")
                            elif event_payload:
                                logging.warning(f"Eventstorming payload was not a dictionary: {event_payload}")

                            # Correctly handle the dictionary of UML diagrams
                            uml_diagrams_payload = final_payload.get("uml_diagrams")
                            if isinstance(uml_diagrams_payload, dict):
                                uml_dir = Path("data/uml")
                                uml_dir.mkdir(parents=True, exist_ok=True)
                                
                                # Iterate through each UML diagram in the dictionary
                                for context_name, uml_payload in uml_diagrams_payload.items():
                                    if isinstance(uml_payload, dict):
                                        # Use the instanceName from the UML payload for the filename
                                        uml_filename = _slugify(uml_payload.get("instanceName")) + ".json"
                                        with (uml_dir / uml_filename).open("w", encoding="utf-8") as f:
                                            json.dump(uml_payload, f, ensure_ascii=False, indent=2)
                                        logging.info(f"Saved UML diagram for '{context_name}' to {uml_dir / uml_filename}")
                                    else:
                                        logging.warning(f"UML payload for '{context_name}' was not a dictionary.")
                            elif uml_diagrams_payload:
                                logging.warning(f"UML diagrams payload was not a dictionary: {uml_diagrams_payload}")
                        except Exception as write_err:
                            logging.error(f"Failed to save board files: {write_err}")
                else:
                    logging.warning("Could not find a valid artifact in the response.")
                    # Log the result object for debugging if artifact is not found
                    logging.info(f"Response result object for debugging: {json.dumps(result_obj, indent=2)}")

            else:
                logging.error(f"Error: Received status code {response.status_code}")
                logging.error(f"Response body: {response.text}")

        except httpx.RequestError as e:
            logging.error(f"Request to orchestrator failed: {e}")
        finally:
            logging.info("--- Intelligent Orchestration Test Finished ---")

if __name__ == '__main__':
    asyncio.run(run_orchestration_test())
