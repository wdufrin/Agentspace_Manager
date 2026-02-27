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


from google.adk.agents import Agent
from tools import get_bigquery_mcp_toolset
import logging

# Simulate an unpickleable object at module level works IF it's inside the factory
# But wait, get_bigquery_mcp_toolset() opens a file? 
# If I put it inside create_agent(), it opens at runtime.

def create_agent():
    # This simulate the "open file" happening effectively at instantiation time
    # which is now verifying that it happens INSIDE the container, not at import.
    return Agent(
        name="test",
        description="test",
        model="gemini-2.5-flash",
        instruction="test",
        tools=[get_bigquery_mcp_toolset()]
    )
