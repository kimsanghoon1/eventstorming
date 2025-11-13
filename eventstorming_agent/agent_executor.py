
import logging
import uuid
import httpx
from typing import Any

from a2a.client import A2AClient, A2ACardResolver
from a2a.server.agent_execution import AgentExecutor, RequestContext
from a2a.server.events import EventQueue
from a2a.server.tasks import TaskUpdater
from a2a.types import (
    InternalError,
    InvalidParamsError,
    MessageSendParams,
    SendMessageRequest,
    TaskState,
    Part,
    TextPart,
    UnsupportedOperationError,
)
from a2a.utils import new_agent_text_message, new_task
from a2a.utils.errors import ServerError

from agent import EventstormingAgent

logging.basicConfig(level=logging.INFO, encoding='utf-8')
logger = logging.getLogger(__name__)

# --- Agent Discovery Mock ---
AGENT_REGISTRY = {
    "eventstorming_agent": "http://localhost:10006",
    "uml_agent": "http://localhost:10005",
}

async def discover_agent_by_skill(skill_id: str, httpx_client: httpx.AsyncClient) -> A2AClient | None:
    logger.info(f"Discovering agent with skill: {skill_id}...")
    for name, base_url in AGENT_REGISTRY.items():
        try:
            resolver = A2ACardResolver(httpx_client=httpx_client, base_url=base_url)
            agent_card = await resolver.get_agent_card()
            if any(skill.id == skill_id for skill in agent_card.skills):
                logger.info(f"Found agent '{name}' at {base_url} with the required skill.")
                return A2AClient(httpx_client=httpx_client, agent_card=agent_card)
        except Exception:
            logger.warning(f"Could not resolve agent card for '{name}' at {base_url}. It might be offline.")
            continue
    logger.error(f"No agent found with skill: {skill_id}")
    return None

class EventstormingAgentExecutor(AgentExecutor):
    """A simple executor for the specialized EventstormingAgent."""

    def __init__(self):
        self.agent = EventstormingAgent()

    async def execute(
        self,
        context: RequestContext,
        event_queue: EventQueue,
    ) -> None:
        task = context.current_task or new_task(context.message)
        await event_queue.enqueue_event(task)
        updater = TaskUpdater(event_queue, task.id, task.context_id)

        try:
            user_query = context.get_user_input()
            
            await updater.update_status(TaskState.working, new_agent_text_message(text="EventstormingAgent is facilitating the session...", context_id=task.context_id, task_id=task.id))

            # Directly invoke the agent's async logic.
            final_result = await self.agent.ainvoke(user_query)
            
            await updater.add_artifact(
                [Part(root=TextPart(text=final_result))],
                name='eventstorming_board_result'
            )
            await updater.complete()

        except Exception as e:
            logger.error(f"An error occurred in EventstormingAgentExecutor: {e}", exc_info=True)
            await updater.update_status(TaskState.failed, new_agent_text_message(text=f"An error occurred: {e}", context_id=task.context_id, task_id=task.id), final=True)
    
    def _validate_request(self, context: RequestContext) -> bool:
        return False

    async def cancel(
        self, context: RequestContext, event_queue: EventQueue
    ) -> None:
        raise ServerError(error=UnsupportedOperationError())
