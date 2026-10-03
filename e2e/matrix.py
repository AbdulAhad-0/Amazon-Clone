"""Playwright verification matrix. Run against a production server on :3000.

Usage: npm run e2e   (server must already run: npm run start)
"""
import json
import os
import re
import sys
import urllib.parse
import urllib.request
import uuid

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from playwright.sync_api import sync_playwright

BASE = os.environ.get("E2E_BASE_URL", "http://localhost:3000")
REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EV = os.path.join(REPO, "docs", "evidence")


def envfile(name: str) -> str:
    with open(os.path.join(REPO, ".env.local"), encoding="utf-8") as fh:
        for line in fh:
            if line.startswith(name + "="):
                return line.split("=", 1)[1].strip()
    raise SystemExit(f"missing {name} in .env.local")


def admin_rest(method: str, path: str, payload=None):
    req = urllib.request.Request(
        envfile("NEXT_PUBLIC_SUPABASE_URL") + path,
        data=json.dumps(payload).encode() if payload is not None else None,
        method=method,
        headers={
            "apikey": envfile("SUPABASE_SERVICE_ROLE_KEY"),
            "Authorization": f"Bearer {envfile('SUPABASE_SERVICE_ROLE_KEY')}",
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(req) as resp:
        body = resp.read()
        return json.loads(body) if body else {}

results = []


def check(name, cond, extra=""):
    results.append(("PASS" if cond else "FAIL", name, str(extra)))
    print(("[OK]  " if cond else "[ERR] ") + name + (f"  ({extra})" if extra else ""), flush=True)


def qparams(url):
    return dict(urllib.parse.parse_qsl(urllib.parse.urlparse(url).query))


with sync_playwright() as p:
    browser = p.chromium.launch(channel="msedge", headless=True)
    ctx = browser.new_context(viewport={"width": 1280, "height": 900})
    page = ctx.new_page()
    suggest = []
    page.on("request", lambda r: suggest.append(r.url) if "/api/suggest" in r.url else None)

    # ---------- Phase A: desktop 1280 rail ----------
    resp = page.goto(f"{BASE}/search", wait_until="domcontentloaded")
    page.wait_for_timeout(900)
    check("A1 GET /search returns 200", resp.status == 200, resp.status)
    check("A2 desktop rail visible", page.locator('nav[aria-label="Filters"]').is_visible())
    trig = page.get_by_test_id("filters-trigger")
    check("A3 sticky Filters trigger hidden on desktop", trig.count() >= 1 and not trig.first.is_visible())

    page.select_option("#rail-group", "electronics")
    page.wait_for_url("**/search?group=electronics", timeout=12000)
    page.wait_for_timeout(500)
    check("A4 rail select writes group URL", page.url.endswith("/search?group=electronics"), page.url)
    check("A5 select value mirrors URL", page.locator("#rail-group").input_value() == "electronics")
    h1 = page.locator("h1").first.inner_text()
    check("A6 heading shows results count", h1.endswith("results"), h1)
    page.screenshot(path=os.path.join(EV, "03-search-rail-applied.png"), full_page=True)

    page.go_back(wait_until="domcontentloaded")
    page.wait_for_timeout(600)
    check("A7 Back restores previous URL", qparams(page.url) == {}, page.url)
    check("A8 Back restores filter control", page.locator("#rail-group").input_value() == "")

    page.goto(f"{BASE}/search", wait_until="domcontentloaded")
    page.wait_for_timeout(800)
    page.select_option("#rail-group", "electronics")
    page.wait_for_url("**/search?group=electronics")
    labels = page.locator('label:has(input[name="rail-brand"])')
    check("A9 brand options rendered", labels.count() >= 2, f"options={labels.count()}")
    brand_name = labels.nth(1).inner_text().strip()
    labels.nth(1).click()
    page.wait_for_function(
        "b => new URLSearchParams(location.search).get('brand') === b", arg=brand_name, timeout=8000
    )
    page.fill('input[aria-label="Minimum price in dollars"]', "10")
    page.press('input[aria-label="Minimum price in dollars"]', "Enter")
    page.wait_for_function("() => new URLSearchParams(location.search).get('min') === '10'", timeout=8000)
    page.get_by_role("radio", name="4 stars & up").click()
    page.wait_for_function("() => new URLSearchParams(location.search).get('rating') === '4'", timeout=8000)
    page.select_option("#rail-sort", "price_asc")
    page.wait_for_function("() => new URLSearchParams(location.search).get('sort') === 'price_asc'", timeout=8000)
    page.wait_for_timeout(400)
    got = qparams(page.url)
    want = {"group": "electronics", "brand": brand_name, "min": "10", "rating": "4", "sort": "price_asc"}
    check("A10 combined URL matches exact filter set", got == want, got)
    chips = page.locator('div[aria-label="Applied filters"] > span')
    check("A11 five chips shown", chips.count() == 5, chips.count())
    page.screenshot(path=os.path.join(EV, "03-search-chips.png"), full_page=True)

    rm = page.locator('div[aria-label="Applied filters"] button[aria-label^="Remove filter"]')
    rm.first.click()
    page.wait_for_function("() => !new URLSearchParams(location.search).has('group')", timeout=8000)
    page.wait_for_timeout(300)
    check("A12 chip x removes only its param", qparams(page.url) == {k: v for k, v in want.items() if k != "group"}, page.url)
    check("A13 group select cleared after chip removal", page.locator("#rail-group").input_value() == "")

    page.get_by_role("button", name="Clear all", exact=True).click()
    page.wait_for_function("() => location.pathname === '/search' && location.search === ''", timeout=8000)
    page.wait_for_timeout(400)
    check(
        "A14 Clear all resets to /search",
        qparams(page.url) == {} and page.locator('div[aria-label="Applied filters"]').count() == 0,
        page.url,
    )

    before = len(suggest)
    inp = page.locator('input[aria-label="Search products"]')
    inp.click()
    inp.type("shirt", delay=40)
    page.wait_for_timeout(800)
    delta = len(suggest) - before
    check("A15 typing fires <=2 suggest requests (no per-keystroke)", 1 <= delta <= 2, f"requests={delta}")
    sugg = page.locator('ul[aria-label="Search suggestions"] li a')
    check("A16 suggestion dropdown opens", sugg.count() > 0 and sugg.first.is_visible(), sugg.count())
    sugg.first.click()
    page.wait_for_url("**/p/**", timeout=8000)
    check("A17 suggestion click opens PDP", page.url.startswith(BASE + "/p/"), page.url)

    r = page.goto(f"{BASE}/search?sort=hax&page=-3&rating=99&min=abc&max=1e9", wait_until="domcontentloaded")
    page.wait_for_timeout(700)
    h1i = page.locator("h1").first.inner_text()
    check(
        "A18 invalid params render 200 defaults",
        r.status == 200 and re.match(r"^\d+ results?$", h1i) and page.locator('div[aria-label="Applied filters"]').count() == 0,
        f"status={r.status} h1={h1i!r}",
    )
    page.screenshot(path=os.path.join(EV, "03-search-invalid.png"), full_page=True)

    r2 = page.goto(f"{BASE}/search?q=men%27s", wait_until="domcontentloaded")
    page.wait_for_timeout(600)
    h1q = page.locator("h1").first.inner_text()
    check("A19 q=men's renders 200 with quote intact", r2.status == 200 and "men's" in h1q, f"status={r2.status} h1={h1q!r}")

    # ---------- Phase B: mobile 390x844 ----------
    page.set_viewport_size({"width": 390, "height": 844})
    page.goto(f"{BASE}/search", wait_until="domcontentloaded")
    page.wait_for_timeout(900)
    check("B1 rail hidden on mobile", not page.locator('nav[aria-label="Filters"]').is_visible())
    trig = page.get_by_test_id("filters-trigger")
    check("B2 sticky Filters trigger visible on mobile", trig.first.is_visible())
    page.screenshot(path=os.path.join(EV, "03-search-mobile.png"))

    trig.first.click()
    dialog = page.get_by_role("dialog", name="Filters")
    check("B3 bottom sheet opens", dialog.is_visible())
    page.screenshot(path=os.path.join(EV, "03-search-sheet.png"))

    dialog.locator("#sheet-group").select_option("electronics")
    page.wait_for_url("**/search?group=electronics", timeout=12000)
    page.wait_for_timeout(500)
    check("B4 sheet writes SAME URL as rail", page.url.endswith("/search?group=electronics"), page.url)
    check("B5 sheet stays open after change", dialog.is_visible())
    page.screenshot(path=os.path.join(EV, "03-search-sheet-applied.png"))

    dialog.get_by_role("button", name=re.compile(r"^Show \d+ result")).click()
    page.wait_for_timeout(500)
    check("B6 Show results closes sheet", not dialog.is_visible())
    check("B7 chips visible on mobile", page.locator('div[aria-label="Applied filters"]').is_visible())
    page.screenshot(path=os.path.join(EV, "03-search-mobile-chips.png"), full_page=True)

    page.go_back(wait_until="domcontentloaded")
    page.wait_for_timeout(600)
    check("B8 Back restores clean state on mobile", qparams(page.url) == {}, page.url)

    # ---------- Phase C: link inventory ----------
    page.set_viewport_size({"width": 1280, "height": 900})
    hrefs = set()
    for path in ["/", "/search"]:
        page.goto(BASE + path, wait_until="domcontentloaded")
        page.wait_for_timeout(700)
        for h in page.eval_on_selector_all("a[href]", "els => els.map(e => e.getAttribute('href'))"):
            if h and h.startswith("/") and not h.startswith("//"):
                hrefs.add(h.split("#")[0])
    bad = []
    for h in sorted(hrefs):
        rr = ctx.request.get(BASE + h)
        if rr.status != 200:
            bad.append(f"{h}={rr.status}")
    check("C1 every footer/nav link returns 200", not bad, f"links={len(hrefs)} bad={bad}")

    # ---------- Phase D: auth + guards ----------
    for path in ["/orders", "/account", "/checkout", "/reviews"]:
        rr = ctx.request.get(BASE + path, max_redirects=0)
        loc = rr.headers.get("location", "")
        check(
            f"D0 signed-out {path} -> 307 signin with next=",
            rr.status == 307 and f"next={urllib.parse.quote(path, safe='')}" in loc,
            f"{rr.status} {loc}",
        )

    email = f"e2e-auth-{uuid.uuid4().hex[:8]}@example.com"
    pw = "E2e-Test-Passw0rd!1"
    created = admin_rest(
        "POST",
        "/auth/v1/admin/users",
        {"email": email, "password": pw, "email_confirm": True, "user_metadata": {}},
    )
    uid = (created.get("user") or created.get("id") or "") if isinstance(created, dict) else ""

    try:
        # sign-out state: header shows Sign in
        page.goto(f"{BASE}/", wait_until="domcontentloaded")
        page.wait_for_timeout(700)
        check("D1 signed-out header shows Sign in", page.get_by_role("link", name="Sign in").first.is_visible())

        # sign-in with valid next -> lands back on /orders (Review Focus)
        page.goto(f"{BASE}/signin?next=%2Forders", wait_until="domcontentloaded")
        page.wait_for_timeout(600)
        check("D2 signin page hidden next preserved", page.locator('input[name="next"]').input_value() == "/orders")
        page.screenshot(path=os.path.join(EV, "04-signin.png"), full_page=True)
        page.fill("#auth-email", email)
        page.fill("#auth-password", pw)
        page.locator('form button[type="submit"]').click()
        page.wait_for_url("**/orders", timeout=15000)
        check("D3 sign-in returns to sent page (/orders)", page.url.startswith(BASE + "/orders"), page.url)

        # open-redirect guard: next=//evil.com must land on /
        page.goto(f"{BASE}/signin?next=//evil.com", wait_until="domcontentloaded")
        page.wait_for_timeout(500)
        check("D4 page-level next //evil neutralised", page.locator('input[name="next"]').input_value() == "/")
        page.fill("#auth-email", email)
        page.fill("#auth-password", pw)
        page.locator('form button[type="submit"]').click()
        page.wait_for_function("() => location.pathname === '/'", timeout=15000)
        check("D5 //evil.com lands on /", page.url.rstrip("/") == BASE, page.url)

        # signed in: header shows account name (email prefix — no full_name set)
        prefix = email.split("@")[0]
        check(
            "D6 signed-in header shows email prefix",
            page.get_by_role("button", name=f"Hello, {prefix}").count() >= 1,
        )
        rr = ctx.request.get(BASE + "/orders", max_redirects=0)
        check("D7 signed-in /orders not redirected", rr.status != 307, rr.status)

        # sign out from menu -> header flips, guard redirects again
        page.get_by_role("button", name=re.compile(r"^Hello,")).first.click()
        page.get_by_role("button", name="Sign out").click()
        page.wait_for_function("() => location.pathname === '/'", timeout=15000)
        page.wait_for_timeout(600)
        check("D8 header back to Sign in after sign-out", page.get_by_role("link", name="Sign in").first.is_visible())
        rr = ctx.request.get(BASE + "/orders", max_redirects=0)
        check("D9 guard redirects again after sign-out", rr.status == 307, rr.status)

        # sign-up via UI with name -> header shows that name
        su_email = f"e2e-signup-{uuid.uuid4().hex[:8]}@example.com"
        su_name = f"E2E Tester {uuid.uuid4().hex[:6]}"
        su_uid = ""
        page.goto(f"{BASE}/signup", wait_until="domcontentloaded")
        page.wait_for_timeout(500)
        page.fill("#auth-name", su_name)
        page.fill("#auth-email", su_email)
        page.fill("#auth-password", pw)
        page.locator('form button[type="submit"]').click()
        page.wait_for_function("() => location.pathname === '/'", timeout=15000)
        page.wait_for_timeout(700)
        check(
            f"D10 sign-up with name -> header Hello, {su_name}",
            page.get_by_role("button", name=f"Hello, {su_name}").count() == 1,
        )
        page.screenshot(path=os.path.join(EV, "04-auth.png"))
        profiles = admin_rest(
            "GET", f"/rest/v1/profiles?display_name=eq.{urllib.parse.quote(su_name)}&select=display_name"
        )
        check("D11 profiles row auto-created with display name", len(profiles) == 1, profiles)
        # find signup uid for cleanup
        listing = admin_rest("GET", f"/auth/v1/admin/users?page=1&per_page=200")
        for u in listing.get("users", []):
            if u.get("email") == su_email:
                su_uid = u["id"]
    finally:
        for u in (uid, su_uid):
            if u:
                try:
                    admin_rest("DELETE", f"/auth/v1/admin/users/{u}")
                except Exception:
                    pass

    # mobile 390: sign-in screen
    page.set_viewport_size({"width": 390, "height": 844})
    page.goto(f"{BASE}/signin", wait_until="domcontentloaded")
    page.wait_for_timeout(600)
    check("D12 sign-in form visible at 390", page.locator("#auth-password").is_visible())
    page.screenshot(path=os.path.join(EV, "04-signin-mobile.png"), full_page=True)
    page.set_viewport_size({"width": 1280, "height": 900})

    # ---------- Phase E: no service key in client bundle ----------
    static_dir = os.path.join(REPO, ".next", "static")
    hits = []
    for root, _dirs, files in os.walk(static_dir):
        for f in files:
            if f.endswith((".js", ".css")):
                try:
                    txt = open(os.path.join(root, f), encoding="utf-8", errors="ignore").read()
                except OSError:
                    continue
                if "SERVICE_ROLE" in txt:
                    hits.append(f)
    check("E1 no SERVICE_ROLE in client bundle", not hits, hits)

    browser.close()

fails = [r for r in results if r[0] == "FAIL"]
print("\n==== SUMMARY ====")
print(f"total={len(results)} pass={len(results) - len(fails)} fail={len(fails)}")
for f in fails:
    print("FAIL:", f[1], "->", f[2])
sys.exit(1 if fails else 0)
