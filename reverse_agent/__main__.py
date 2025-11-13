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
from agent_executor import ReverseAgentExecutor

@click.command()
@click.option('--host', 'host', default='localhost')
@click.option('--port', 'port', default=10001)
def main(host, port):
    logging.basicConfig(level=logging.INFO)
    logging.info(f'Starting reverse agent on {host}:{port}')
    
    try:
        capabilities = AgentCapabilities(
            streaming=True, push_notifications=True, tasks=True
        )
        skill = AgentSkill(
            id='reverse-engineer-from-zip',
            name='Reverse Engineer from Zip',
            description='Reverse engineers a model from a zip file.',
            tags=['reverse engineering', 'modeling', 'zip'],
            examples=['Reverse engineer the model from the attached zip file.'],
        )
        agent_card = AgentCard(
            name='Reverse Engineering Agent',
            description='Reverse engineers a model from a zip file.',
            url=f'http://{host}:{port}/',
            version='1.0.0',
            default_input_modes=['application/zip'],
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
            agent_executor=ReverseAgentExecutor(),
            task_store=InMemoryTaskStore(),
            push_config_store=push_config_store,
            push_sender= push_sender
        )
        server = A2AStarletteApplication(
            agent_card=agent_card, http_handler=request_handler
        )

        uvicorn.run(server.build(), host=host, port=port)
    except Exception as e:
        logging.error(f'Error starting reverse agent: {e}')
        sys.exit(1)

if __name__ == '__main__':
    main()
