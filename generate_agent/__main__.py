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
from agent_executor import GenerateAgentExecutor

@click.command()
@click.option('--host', 'host', default='localhost')
@click.option('--port', 'port', default=10000)
def main(host, port):
    logging.basicConfig(level=logging.INFO)
    logging.info(f'Starting generate agent on {host}:{port}')

    try:
        capabilities = AgentCapabilities(
            doc_support=False,
            push_support=True,
            task_support=True,
        )

        skill = AgentSkill(
            id='generate-code-from-board',
            name='Generate Java Spring Boot Code',
            description='Generates a Java Spring Boot project structure from a UML class diagram.',
            default_input_modes=['text/plain'],
            default_output_modes=['text/plain'],
            tags=['codegen', 'java', 'spring'],
        )

        agent_card = AgentCard(
            id='generate-agent',
            name='Generate Agent',
            description='An agent that generates source code from UML diagrams.',
            version='0.0.1',
            url=f'http://{host}:{port}/',
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
            agent_executor=GenerateAgentExecutor(),
            task_store=InMemoryTaskStore(),
            push_config_store=push_config_store,
            push_sender=push_sender
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