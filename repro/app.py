
import sys
import os

# Ensure we can import from current directory
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from agent import create_agent, SyncAgentWrapper

app = SyncAgentWrapper()
