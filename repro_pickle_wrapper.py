# Copyright 2024 Google LLC
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.


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
