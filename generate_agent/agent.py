import os

from collections.abc import AsyncIterable
from typing import Any, Literal

import httpx
from langchain_core.messages import AIMessage, ToolMessage
from langchain_openai import ChatOpenAI
from langgraph.checkpoint.memory import MemorySaver
from langgraph.prebuilt import create_react_agent
from pydantic import BaseModel


memory = MemorySaver()


# @tool
# def get_exchange_rate(
#     currency_from: str = 'USD',
#     currency_to: str = 'EUR',
#     currency_date: str = 'latest',
# ):
#     """Use this to get current exchange rate.

#     Args:
#         currency_from: The currency to convert from (e.g., "USD").
#         currency_to: The currency to convert to (e.g., "EUR").
#         currency_date: The date for the exchange rate or "latest". Defaults to
#             "latest".

#     Returns:
#         A dictionary containing the exchange rate data, or an error message if
#         the request fails.
#     """
#     try:
#         response = httpx.get(
#             f'https://api.frankfurter.app/{currency_date}',
#             params={'from': currency_from, 'to': currency_to},
#         )
#         response.raise_for_status()

#         data = response.json()
#         if 'rates' not in data:
#             return {'error': 'Invalid API response format.'}
#         return data
#     except httpx.HTTPError as e:
#         return {'error': f'API request failed: {e}'}
#     except ValueError:
#         return {'error': 'Invalid JSON response from API.'}


class ResponseFormat(BaseModel):
    """Respond to the user in this format."""

    status: Literal['input_required', 'completed', 'error'] = 'input_required'
    message: str


class GenerateAgent:
    """GenerateAgent - a specialized assistant for generating source code from a visual board model."""

    def __init__(self):
        self.system_instruction = (
            'You are a specialized assistant for currency conversions. '
            "Your sole purpose is to use the 'get_exchange_rate' tool to answer questions about currency exchange rates. "
            'If the user asks about anything other than currency conversion or exchange rates, '
            'politely state that you cannot help with that topic and can only assist with currency-related queries. '
            'Do not attempt to answer unrelated questions or use tools for other purposes.'
        )
        
        self.openai_api_key = os.getenv('OPENAI_API_KEY')
        self.llm = ChatOpenAI(
            api_key=self.openai_api_key,
            base_url=os.getenv('OPENAI_API_BASE_URL'),
            model=os.getenv('OPENAI_API_MODEL'),
            temperature=0,
        )
        
        self.tools = []

        self.graph = create_react_agent(
            self.llm,
            tools=self.tools,
            checkpointer=memory,
        )

    async def stream(self, query, context_id) -> AsyncIterable[dict[str, Any]]:
        system_message = ('system', self.system_instruction)
        inputs = {'messages': [system_message, ('user', query)]}
        config = {'configurable': {'thread_id': context_id}}

        for item in self.graph.stream(inputs, config, stream_mode='values'):
            message = item['messages'][-1]
            if (
                isinstance(message, AIMessage)
                and message.tool_calls
                and len(message.tool_calls) > 0
            ):
                yield {
                    'is_task_complete': False,
                    'require_user_input': False,
                    'content': 'Looking up the exchange rates...',
                }
            elif isinstance(message, ToolMessage):
                yield {
                    'is_task_complete': False,
                    'require_user_input': False,
                    'content': 'Processing the exchange rates..',
                }

        yield self.get_agent_response(config)

    def get_agent_response(self, config):
        current_state = self.graph.get_state(config)
        structured_response = current_state.values.get('structured_response')
        if structured_response and isinstance(
            structured_response, ResponseFormat
        ):
            if structured_response.status == 'input_required':
                return {
                    'is_task_complete': False,
                    'require_user_input': True,
                    'content': structured_response.message,
                }
            if structured_response.status == 'error':
                return {
                    'is_task_complete': False,
                    'require_user_input': True,
                    'content': structured_response.message,
                }
            if structured_response.status == 'completed':
                return {
                    'is_task_complete': True,
                    'require_user_input': False,
                    'content': structured_response.message,
                }

        return {
            'is_task_complete': False,
            'require_user_input': True,
            'content': (
                'We are unable to process your request at the moment. '
                'Please try again.'
            ),
        }

    SUPPORTED_CONTENT_TYPES = ['text', 'text/plain']