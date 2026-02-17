import cloudpickle
import subprocess
p = subprocess.Popen(["echo", "hello"], stdout=subprocess.PIPE, stdin=subprocess.PIPE)
try:
    cloudpickle.dumps(p)
except Exception as e:
    print(f"Error pickling: {e}")
