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
import app
import sys
import os

print("Testing pickle of Lazy Wrapper with Factory Pattern...")

try:
    # 1. Pickle the app wrapper (Simulates deployment upload)
    dumped = cloudpickle.dumps(app.app)
    print("SUCCESS: Pickled app.app (SyncAgentWrapper)")
    
    # 2. Unpickle (Simulates remote container startup)
    restored_app = cloudpickle.loads(dumped)
    print("SUCCESS: Unpickled app.app")

    # 3. Trigger set_up (Simulates Vertex AI initialization)
    print("Triggering set_up() corresponding to remote instantiation...")
    
    # Ensure usage of mock tools that simulate file opening
    # We need to make sure 'agent' module is reloadable or fresh
    if 'agent' in sys.modules:
        del sys.modules['agent']
        
    restored_app.set_up()
    print("SUCCESS: set_up() completed (Agent created via factory)")
    
    if restored_app._lazy_agent:
        print("SUCCESS: _lazy_agent is populated")
    else:
        print("FAILURE: _lazy_agent is None")

except Exception as e:
    print(f"FAILURE: {e}")
    import traceback
    traceback.print_exc()
