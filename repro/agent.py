
import os
from typing import Any, Optional, List, Dict, Union

class Agent:
    def __init__(self):
        self.model = "gemini-1.5-flash-001"

def create_agent():
    return Agent()

class SyncAgentWrapper:
    def __init__(self):
        self._lazy_agent = None  
        self._lazy_tools = []
    
    def set_up(self):
        print("Initializing agent...")
        self._lazy_agent = create_agent()
        print(f"Agent initialized: {self._lazy_agent}")

    def query(self, prompt: str):
        if self._lazy_agent is None:
             self.set_up()
        return "response"
