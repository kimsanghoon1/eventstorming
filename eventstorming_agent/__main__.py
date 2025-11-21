import logging
import click
import httpx
import uvicorn
import sys
from dotenv import load_dotenv

# Load environment variables before importing agents that might initialize clients
load_dotenv()

from a2a.server.apps import A2AStarletteApplication
from a2a.server.request_handlers import DefaultRequestHandler
from a2a.server.tasks import (
    BasePushNotificationSender,
    InMemoryPushNotificationConfigStore,
    InMemoryTaskStore,
)
from a2a.types import (AgentCard, AgentSkill, AgentCapabilities)
from agent_executor import EventstormingAgentExecutor

@click.command()
@click.option('--host', 'host', default='localhost')
@click.option('--port', 'port', default=10006)
def main(host, port):
    logging.basicConfig(level=logging.INFO)
    logging.info(f'Starting Eventstorming agent on {host}:{port}')
    
    try:
        capabilities = AgentCapabilities(
            streaming=True, push_notifications=True, tasks=True
        )
        skill = AgentSkill(
            id='facilitate_eventstorming',
            name='Facilitate an Eventstorming Session',
            description='Creates an Eventstorming board to discover domain events.',
            tags=['modeling', 'eventstorming', 'domain-driven design'],
            examples=['Facilitate an eventstorming session for an online shopping service.'],
        )
        agent_card = AgentCard(
            name='Eventstorming Agent',
            description='A specialized agent for facilitating Eventstorming sessions.',
            url=f'http://{host}:{port}/',
            version='1.0.0',
            default_input_modes=['text/plain'],
            default_output_modes=['text/plain'], # Or a specific format for boards
            capabilities=capabilities,
            skills=[skill], 
        )
        # --8<-- [start:DefaultRequestHandler]
        httpx_client = httpx.AsyncClient()
        push_config_store = InMemoryPushNotificationConfigStore()
        push_sender = BasePushNotificationSender(httpx_client=httpx_client,
                        config_store=push_config_store)
        request_handler = DefaultRequestHandler(
            agent_executor=EventstormingAgentExecutor(),
            task_store=InMemoryTaskStore(),
            push_config_store=push_config_store,
            push_sender= push_sender
        )
        server = A2AStarletteApplication(
            agent_card=agent_card, http_handler=request_handler
        )

        uvicorn.run(server.build(), host=host, port=port)
    except Exception as e:
        logging.error(f'Error starting Eventstorming agent: {e}')
        sys.exit(1)

if __name__ == '__main__':
    main()
