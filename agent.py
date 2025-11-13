import asyncio
from a2a.server.app import App
from a2a.types import AgentCard, AgentSkill, AgentProvider
from skills.board_skills import (
    list_boards,
    list_uml_boards,
    get_board,
    save_board,
    delete_board,
    get_snapshot,
)
from skills.generation_skills import (
    generate_code_skill,
    reverse_engineer_skill,
    generate_from_requirements_skill,
)

# 1. Define the Agent's Skills
# Each skill maps a unique ID to a handler function.
skills = [
    # Board Skills
    AgentSkill(
        id="generate_code",
        name="Generate Code",
        description="Generates code from a board name.",
    ),
    AgentSkill(
        id="reverse_engineer",
        name="Reverse Engineer Code",
        description="Creates models from existing Java code.",
    ),
    AgentSkill(
        id="generate_from_requirements",
        name="Generate from Requirements",
        description="Creates models from text requirements.",
        handler=generate_from_requirements_skill,
    ),
]

# 2. Define the Agent's Identity Card
# This card is how other agents discover what this agent can do.
agent_card = AgentCard(
    name="EventStorming & UML Modeler Agent",
    description="An agent that manages EventStorming and UML boards and can generate code from them.",
    provider=AgentProvider(organization="My Org"),
    skills=skills,
    # The URL should be the public-facing address of this agent
    url="http://localhost:8000/a2a",
)

# 3. Create and Run the A2A App
app = App(agent_card=agent_card)

# To run this agent:
# 1. Make sure you have installed the dependencies: pip install -r requirements.txt
# 2. Run the agent server: python agent.py
if __name__ == "__main__":
    print("Starting A2A Agent Server...")
    # The A2A server runs on its own, typically using an ASGI server like uvicorn.
    # The App object from a2a-sdk is a runnable ASGI application.
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
