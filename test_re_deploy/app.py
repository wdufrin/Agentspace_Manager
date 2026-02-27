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


import asyncio
import logging

try:
    import nest_asyncio
    nest_asyncio.apply()
except ImportError:
    pass

logger = logging.getLogger(__name__)

class SyncAgentWrapper:
    def __init__(self):
        self._lazy_agent = None
        self._lazy_tools = []
        self.py_class_name = None

    def set_up(self):
        if self._lazy_agent is None:
            logger.info("Lazily initializing ADK Agent inside set_up()...")
            from agent import create_agent
            self._lazy_agent = create_agent()

            if hasattr(self._lazy_agent, 'tools'):
                self._lazy_tools = self._lazy_agent.tools
            if hasattr(self._lazy_agent, 'py_class_name'):
                 self.py_class_name = self._lazy_agent.py_class_name

    def query(self, input: str = "", message: str = "", **kwargs) -> str:
        if self._lazy_agent is None:
             self.set_up()
        # Mock query execution
        return "Response"

# Wrap for deployment (lazy)
app = SyncAgentWrapper()
