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
from google.adk.tools.mcp_tool import StreamableHTTPConnectionParams

params = StreamableHTTPConnectionParams(url="https://test.com")
try:
    cloudpickle.dumps(params)
    print("Success pickling StreamableHTTPConnectionParams")
except Exception as e:
    print(f"Failed to pickle StreamableHTTPConnectionParams: {e}")
    import traceback
    traceback.print_exc()
