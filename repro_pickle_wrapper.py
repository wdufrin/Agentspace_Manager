
import cloudpickle
import sys
from typing import Any, Optional, List, Dict, Union

# Simulate agent.py
class Agent:
    def __init__(self):
        self.model = "gemini-1.5-flash-001"

def create_agent():
    return Agent()

class SyncAgentWrapper:
    def __init__(self):
        self._lazy_agent = None  # Renamed attribute to avoid SDK auto-inspection
        self._lazy_tools = []    # Renamed attribute
    
    def set_up(self):
        """Initializes the agent. Called by Reasoning Engine on cold start."""
        print("Initializing agent...")
        self._lazy_agent = create_agent()
        print(f"Agent initialized: {self._lazy_agent}")

    def query(self, prompt: str):
        if self._lazy_agent is None:
             self.set_up()
        return "response"

# Simulate app.py
# In app.py:
# from agent import create_agent, SyncAgentWrapper
# app = SyncAgentWrapper()

app = SyncAgentWrapper()

try:
    print("Attempting to pickle app...")
    dumped = cloudpickle.dumps(app)
    print("Pickled successfully!")
    loaded = cloudpickle.loads(dumped)
    print(f"Loaded successfully: {loaded}")
except Exception as e:
    print(f"Pickling failed: {e}")
    import traceback
    traceback.print_exc()
