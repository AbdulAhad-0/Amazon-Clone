import time, urllib.request

def get(path):
    t = time.time()
    with urllib.request.urlopen("http://localhost:3000" + path, timeout=45) as r:
        return r.status, r.read().decode("utf-8", "ignore"), time.time() - t

st, home, dt = get("/")
print(f"HOME: status={st} size={len(home)/1024:.1f}KB time={dt:.1f}s", flush=True)
for label, needle in [
    ("H1 carousel next button", 'aria-label="Next slide"'),
    ("H2 quick links row", "All categories"),
    ("H3 deals quick link", "Today&#39;s Deals"),
    ("H4 budget strip", "Shop by budget"),
    ("H5 footer columns", "Best Sellers"),
    ("H6 carousel h1", "What you see is what you pay."),
]:
    print(f"{label}: {'PASS' if needle in home else 'FAIL'}", flush=True)

st, deals, dt = get("/deals")
print(f"DEALS: status={st} time={dt:.1f}s count-h1={'PASS' if 'deals' in deals else 'FAIL'} upto={'PASS' if 'Up to' in deals else 'FAIL'}", flush=True)

st, best, dt = get("/best-sellers")
note = "Best sellers are ranked by units sold on Vendra" in best
real = "Ranked by" in best and "units sold across non-cancelled orders" in best
print(f"BEST-SELLERS: status={st} time={dt:.1f}s fallback_note={'YES' if note else 'NO'} real_note={'YES' if real else 'NO'}", flush=True)
