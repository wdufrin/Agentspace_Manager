import copy
def outer():
    def inner():
        pass
    return inner
func = outer()
try:
    print(copy.deepcopy(func))
    print("Success")
except Exception as e:
    print(f"Error copying func: {e}")
