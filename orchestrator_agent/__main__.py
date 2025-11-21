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
from agent_executor import OrchestratorAgentExecutor

@click.command()
@click.option('--host', 'host', default='localhost')
@click.option('--port', 'port', default=10007)
def main(host, port):
    logging.basicConfig(level=logging.INFO)
    logging.info(f'Starting Orchestrator agent on {host}:{port}')
    
    try:
        capabilities = AgentCapabilities(
            streaming=True, push_notifications=True, tasks=True
        )
        skill = AgentSkill(
            id='orchestrate_modeling_workflow',
            name='Orchestrate Modeling Workflow',
            description='Plans and executes a modeling workflow involving UML and Eventstorming agents.',
            tags=['orchestration', 'planning', 'modeling', 'uml', 'eventstorming'],
            examples=['Model a shopping cart system using eventstorming and UML.'],
        )
        agent_card = AgentCard(
            name='Orchestrator Agent',
            description='A smart project manager agent that plans and executes complex tasks by delegating to specialized agents.',
            url=f'http://{host}:{port}/',
            version='1.0.0',
            default_input_modes=['text/plain'],
            default_output_modes=['text/plain'],
            capabilities=capabilities,
            skills=[skill], 
        )
        httpx_client = httpx.AsyncClient()
        push_config_store = InMemoryPushNotificationConfigStore()
        push_sender = BasePushNotificationSender(httpx_client=httpx_client,
                        config_store=push_config_store)
        request_handler = DefaultRequestHandler(
            agent_executor=OrchestratorAgentExecutor(),
            task_store=InMemoryTaskStore(),
            push_config_store=push_config_store,
            push_sender= push_sender
        )
        server = A2AStarletteApplication(
            agent_card=agent_card, http_handler=request_handler
        )

        uvicorn.run(server.build(), host=host, port=port)
    except Exception as e:
        logging.error(f'Error starting Orchestrator agent: {e}')
        sys.exit(1)

if __name__ == '__main__':
    main()
