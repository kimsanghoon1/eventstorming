import logging
import click
import httpx
import uvicorn
import sys
from a2a.server.apps import A2AStarletteApplication
from a2a.server.request_handlers import DefaultRequestHandler
from a2a.server.tasks import (
    BasePushNotificationSender,
    InMemoryPushNotificationConfigStore,
    InMemoryTaskStore,
)
from a2a.types import (AgentCard, AgentSkill, AgentCapabilities)
from agent_executor import GenerateAgentExecutor

@click.command()
@click.option('--host', 'host', default='localhost')
@click.option('--port', 'port', default=10000)
def main(host, port):
    logging.basicConfig(level=logging.INFO)
    logging.info(f'Starting generate agent on {host}:{port}')
    
    try:
        capabilities = AgentCapabilities(
            streaming=True, push_notifications=True, tasks=True
        )
        skill = AgentSkill(
            id='generate-code-from-board',
            name='Generate Code from Board',
            description='Generates source code from a visual board model.',
            tags=['code generation', 'modeling', 'eventstorming', 'uml'],
            examples=['Generate code for the "OrderService" board.'],
        )
        agent_card = AgentCard(
            name='Source Generator Agent',
            description='Generates source code from a visual board model.',
            url=f'http://{host}:{port}/',
            version='1.0.0',
            default_input_modes=['text/plain'],
            default_output_modes=['text/plain'],
            capabilities=capabilities,
            skills=[skill], 
        )
        # --8<-- [start:DefaultRequestHandler]
        httpx_client = httpx.AsyncClient()
        push_config_store = InMemoryPushNotificationConfigStore()
        push_sender = BasePushNotificationSender(httpx_client=httpx_client,
                        config_store=push_config_store)
        request_handler = DefaultRequestHandler(
            agent_executor=GenerateAgentExecutor(),
            task_store=InMemoryTaskStore(),
            push_config_store=push_config_store,
            push_sender= push_sender
        )
        server = A2AStarletteApplication(
            agent_card=agent_card, http_handler=request_handler
        )

        uvicorn.run(server.build(), host=host, port=port)
    except Exception as e:
        logging.error(f'Error starting generate agent: {e}')
        sys.exit(1)

if __name__ == '__main__':
    main()