import logging
import json
import asyncio
import a2a.types

from a2a.server.agent_execution import AgentExecutor, RequestContext
from a2a.server.events import EventQueue
from a2a.server.tasks import TaskUpdater
from a2a.types import Task, TaskState
from a2a.utils import new_agent_text_message, new_task
from agent import execute_graph

logging.basicConfig(level=logging.INFO, encoding='utf-8')
logger = logging.getLogger(__name__)

class OrchestratorAgentExecutor(AgentExecutor):
    """Executes the orchestration graph."""

    async def execute(self, context: RequestContext, event_queue: EventQueue):
        task = context.current_task or new_task(context.message)
        await event_queue.enqueue_event(task)
        updater = TaskUpdater(event_queue, task.id, task.context_id)

        try:
            user_query = context.get_user_input()
            if not user_query:
                raise ValueError("User query is empty.")
            
            logging.info(f"OrchestratorAgentExecutor received task: {user_query}")
            await updater.update_status(
                TaskState.working, 
                new_agent_text_message("Orchestrator is planning the workflow...", task.context_id, task.id)
            )

            initial_state = {
                "user_input": user_query,
                "files": [], # Assuming no files are passed for now
            }

            final_result = None
            async for event in execute_graph(initial_state):
                if event["type"] == "update":
                    logging.info(f"Streaming update: {event['data']}")
                    await updater.update_status(
                        TaskState.working, 
                        new_agent_text_message(str(event["data"]), task.context_id, task.id)
                    )
                elif event["type"] == "result":
                    final_result = event.get("data")
            
            if final_result:
                logging.info(f"Workflow finished. Final result: {final_result}")
                # The final_result is the JSON string that should be returned to the client.
                # add_artifact is the correct way to send the final payload.
                await updater.add_artifact(
                    [a2a.types.Part(root=a2a.types.TextPart(text=final_result))], 
                    name='final_report'
                )
                # Explicitly completing the task is necessary to send the result.
                await updater.complete()
            else:
                logging.error("Workflow failed to produce a final result.")
                await updater.failed(
                    new_agent_text_message("Workflow failed to produce a final result.", task.context_id, task.id)
                )

        except Exception as e:
            logger.error(f"An error occurred in OrchestratorAgentExecutor: {e}", exc_info=True)
            await updater.failed(
                new_agent_text_message(f"An error occurred: {e}", task.context_id, task.id)
            )

    async def cancel(self, context: RequestContext, event_queue: EventQueue):
        """Placeholder for cancel functionality."""
        logging.warning("Cancel operation is not implemented.")
        pass