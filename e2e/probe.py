import time, urllib.request

paths = ["/c/electronics?page=3", "/c/electronics?page=2", "/c/electronics?page=3"]
for path in paths:
    t = time.time()
    try:
        with urllib.request.urlopen("http://localhost:3000" + path, timeout=45) as r:
            n = len(r.read())
        print(f"{path}: {r.status} {n}B {time.time()-t:.1f}s", flush=True)
    except Exception as e:
        print(f"{path}: ERROR {type(e).__name__} {time.time()-t:.1f}s", flush=True)
