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
from playwright.sync_api import expect, sync_playwright

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
    su_uid = ""

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
        expect(page.get_by_role("button", name=f"Hello, {email.split('@')[0]}").first).to_be_visible(timeout=5000)
        check("D3b header shows user right after sign-in (no manual refresh)", True)

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
        expect(page.get_by_role("link", name="Sign in").first).to_be_visible(timeout=5000)
        check("D8 header back to Sign in after sign-out", True, page.url)
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
        expect(page.get_by_role("button", name=f"Hello, {su_name}").first).to_be_visible(timeout=5000)
        check(
            f"D10 sign-up with name -> header Hello, {su_name}",
            True,
            page.url,
        )
        check("D10b header shows user right after sign-up (no manual refresh)", True)
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

    # ---------- Phase F: cart (guest, signed-in, merge) ----------
    page.set_viewport_size({"width": 1280, "height": 900})

    def open_instock_pdp(hrefs):
        for href in hrefs[:6]:
            page.goto(BASE + href, wait_until="domcontentloaded")
            page.wait_for_timeout(600)
            btn = page.get_by_role("button", name="Add to cart").first
            if btn.count() >= 1 and btn.is_enabled() and "Out of stock" not in btn.inner_text():
                return href
        return None

    cart_uid = ""
    try:
        page.goto(f"{BASE}/", wait_until="domcontentloaded")
        page.wait_for_timeout(800)
        pdps = list(dict.fromkeys(
            page.eval_on_selector_all('a[href^="/p/"]', "els => els.map(e => e.getAttribute('href'))")
        ))
        check("F0 home links to product pages", len(pdps) >= 2, f"pdps={len(pdps)}")
        pdp_a = open_instock_pdp(pdps)
        check("F0b found an in-stock product", bool(pdp_a), pdp_a)

        # F1 guest add from PDP -> toast + badge
        page.get_by_role("button", name="Add to cart").first.click()
        expect(page.get_by_role("link", name="View cart").first).to_be_visible(timeout=5000)
        check("F1 guest add shows 'Added - View cart' toast", True)
        expect(page.get_by_label(re.compile(r"^Cart, \d+ items?$")).first).to_be_visible(timeout=5000)
        check("F1b guest cart badge appears", True)

        # F2 guest cart: line, stepper, server summary
        page.goto(f"{BASE}/cart", wait_until="domcontentloaded")
        page.wait_for_timeout(1200)
        check("F2 guest cart shows the line", page.get_by_role("button", name="Remove").count() == 1)
        page.get_by_role("button", name=re.compile("^Increase quantity")).first.click()
        page.wait_for_timeout(1200)
        qty = page.locator('div[aria-label^="Quantity for"] span').first.inner_text()
        check("F2b guest stepper bumps qty to 2", qty.strip() == "2", qty)
        summary_ok = (
            page.get_by_text("Order summary").count() >= 1
            and page.get_by_text(re.compile(r"free shipping", re.I)).count() >= 1
        )
        check("F2c server summary + free-ship line shown", summary_ok)

        # F4 guest Checkout requires sign-in, next preserved
        page.get_by_role("link", name="Checkout").first.click()
        page.wait_for_url("**/signin**", timeout=8000)
        check("F4 guest checkout -> signin", "/signin" in page.url, page.url)
        check("F4b next preserved as /checkout", page.locator('input[name="next"]').input_value() == "/checkout")

        # F3 remove -> empty state
        page.goto(f"{BASE}/cart", wait_until="domcontentloaded")
        page.wait_for_timeout(1000)
        page.get_by_role("button", name="Remove").first.click()
        page.wait_for_timeout(1200)
        check("F3 remove empties the guest cart", page.get_by_text("Your cart is empty").is_visible())

        # F5 guest add, sign in -> idempotent merge, storage cleared
        page.goto(BASE + pdp_a, wait_until="domcontentloaded")
        page.wait_for_timeout(600)
        page.get_by_role("button", name="Add to cart").first.click()
        expect(page.get_by_label(re.compile(r"^Cart, \d+ items?$")).first).to_be_visible(timeout=5000)

        pdp_b = None
        for h in pdps:
            if h != pdp_a and open_instock_pdp([h]):
                pdp_b = h
                break
        check("F5a second in-stock product found", bool(pdp_b), pdp_b)
        page.goto(BASE + pdp_a, wait_until="domcontentloaded")
        page.wait_for_timeout(400)

        cart_email = f"e2e-cart-{uuid.uuid4().hex[:8]}@example.com"
        pw = "E2e-Cart-Passw0rd!1"
        created = admin_rest(
            "POST",
            "/auth/v1/admin/users",
            {"email": cart_email, "password": pw, "email_confirm": True, "user_metadata": {}},
        )
        cart_uid = (created.get("user") or created.get("id") or "") if isinstance(created, dict) else ""
        page.goto(f"{BASE}/signin", wait_until="domcontentloaded")
        page.wait_for_timeout(500)
        page.fill("#auth-email", cart_email)
        page.fill("#auth-password", pw)
        page.locator('form button[type="submit"]').click()
        page.wait_for_function("() => location.pathname === '/'", timeout=15000)
        expect(page.get_by_role("button", name=re.compile(r"^Hello,")).first).to_be_visible(timeout=5000)
        page.wait_for_function(
            "() => { const v = localStorage.getItem('vendra.cart'); return v === null || v === '[]'; }",
            timeout=10000,
        )
        check("F5 merge clears guest storage after server confirms", True)
        page.goto(f"{BASE}/cart", wait_until="domcontentloaded")
        expect(page.get_by_role("button", name="Remove").first).to_be_visible(timeout=10000)
        check("F5c merged line visible in signed-in cart", True)
        ls = page.evaluate("() => localStorage.getItem('vendra.cart')")
        check("F5d localStorage stays empty", ls in (None, "[]"), ls)

        # F6 signed-in add + reload persistence
        page.goto(BASE + pdp_b, wait_until="domcontentloaded")
        page.wait_for_timeout(600)
        page.get_by_role("button", name="Add to cart").first.click()
        expect(page.get_by_label("Cart, 2 items").first).to_be_visible(timeout=8000)
        check("F6 signed-in add updates server badge to 2", True)
        page.goto(f"{BASE}/cart", wait_until="domcontentloaded")
        expect(page.get_by_role("button", name="Remove").first).to_be_visible(timeout=8000)
        check("F6b cart has 2 lines after reload (persistence)", page.get_by_role("button", name="Remove").count() == 2)
        page.screenshot(path=os.path.join(EV, "05-cart.png"), full_page=True)

        page.get_by_role("button", name=re.compile("^Increase quantity")).first.click()
        page.wait_for_timeout(1200)
        page.reload(wait_until="domcontentloaded")
        page.wait_for_timeout(1000)
        qty2 = page.locator('div[aria-label^="Quantity for"] span').first.inner_text()
        check("F6c qty change survives reload", qty2.strip() == "2", qty2)

        # F8 mobile 390: cart, no horizontal scroll
        page.set_viewport_size({"width": 390, "height": 844})
        page.goto(f"{BASE}/cart", wait_until="domcontentloaded")
        page.wait_for_timeout(1000)
        sw = page.evaluate("() => document.documentElement.scrollWidth")
        check("F8 cart at 390: no horizontal scroll", sw <= 391, f"scrollWidth={sw}")
        page.screenshot(path=os.path.join(EV, "05-cart-mobile.png"), full_page=True)
        page.set_viewport_size({"width": 1280, "height": 900})

        # sign out so later phases/screenshots see a clean guest header
        page.get_by_role("button", name=re.compile(r"^Hello,")).first.click()
        page.get_by_role("button", name="Sign out").click()
        expect(page.get_by_role("link", name="Sign in").first).to_be_visible(timeout=5000)
        check("F9 sign out completes cart phase", True)
    finally:
        if cart_uid:
            try:
                admin_rest("DELETE", f"/auth/v1/admin/users/{cart_uid}")
            except Exception:
                pass

    # ---------- Phase G: category page ----------
    page.set_viewport_size({"width": 1280, "height": 900})
    page.goto(f"{BASE}/c/electronics", wait_until="domcontentloaded")
    page.wait_for_timeout(800)
    check(
        "G1 category band h1",
        page.get_by_role("heading", level=1).inner_text().strip() == "Electronics",
    )
    chip_links = page.locator('nav[aria-label="Sub-categories"] a')
    n_chips = chip_links.count()
    check("G2 sub-category chips present", n_chips >= 2, f"chips={n_chips}")
    chip_texts = [chip_links.nth(i).inner_text() for i in range(min(n_chips, 8))]
    check("G2b chip labels carry counts", all("(" in t for t in chip_texts), str(chip_texts[:4]))
    sub_href = chip_links.nth(1).get_attribute("href") or ""
    check("G2c chip href carries cat param", "cat=" in sub_href, sub_href)
    chip_links.nth(1).click()
    page.wait_for_url("**cat=**", timeout=8000)
    check("G2d chip click writes ?cat= URL state", "cat=" in page.url, page.url)

    page.select_option("#rail-sort", "price_asc")
    page.wait_for_url("**sort=price_asc**", timeout=8000)
    check("G3 sort select writes sort=price_asc", "sort=price_asc" in page.url, page.url)

    page.locator('label:has-text("On sale only")').first.click()
    page.wait_for_url("**deals=1**", timeout=8000)
    check("G4 deals checkbox writes deals=1", "deals=1" in page.url, page.url)

    page.locator('input[name="rail-brand"]').nth(1).click()
    page.wait_for_url("**brand=**", timeout=8000)
    check("G5 brand radio writes brand param", "brand=" in page.url, page.url)
    check("G5b active filter chips shown", page.get_by_label("Applied filters").count() >= 1)

    page.goto(f"{BASE}/c/electronics", wait_until="domcontentloaded")
    page.wait_for_timeout(700)
    check("G6 top-rated rail on default category page", page.locator('[aria-label="Top rated"]').count() == 1)
    page.goto(f"{BASE}/c/electronics?deals=1", wait_until="domcontentloaded")
    page.wait_for_timeout(700)
    check("G6b rail hidden when filters active", page.locator('[aria-label="Top rated"]').count() == 0)

    page.goto(f"{BASE}/c/electronics?page=2", wait_until="domcontentloaded")
    page.wait_for_timeout(700)
    check(
        "G7 pagination reaches page 2",
        page.get_by_text(re.compile(r"Page 2 of \d+")).count() >= 1,
    )

    page.goto(f"{BASE}/c/definitely-not-a-group", wait_until="domcontentloaded")
    page.wait_for_timeout(700)
    check("G8 unknown group shows branded not-found", page.get_by_text("Page not found").count() >= 1)

    page.goto(f"{BASE}/c/electronics", wait_until="domcontentloaded")
    page.wait_for_timeout(700)
    page.evaluate("() => window.scrollTo(0, document.body.scrollHeight)")
    page.wait_for_timeout(1500)
    page.evaluate("() => window.scrollTo(0, 0)")
    page.wait_for_timeout(500)
    page.screenshot(path=os.path.join(EV, "07-category.png"), full_page=True)

    page.set_viewport_size({"width": 390, "height": 844})
    page.reload(wait_until="domcontentloaded")
    page.wait_for_timeout(900)
    sw_cat = page.evaluate("() => document.documentElement.scrollWidth")
    check("G9 category at 390: no horizontal scroll", sw_cat <= 391, f"scrollWidth={sw_cat}")
    page.screenshot(path=os.path.join(EV, "07-category-mobile.png"), full_page=True)
    page.set_viewport_size({"width": 1280, "height": 900})

    # ---------- Phase H: home page + product evidence ----------
    page.goto(f"{BASE}/", wait_until="domcontentloaded")
    page.wait_for_timeout(900)
    check(
        "H1 hero headline",
        "what you see" in page.get_by_role("heading", level=1).inner_text().lower(),
    )
    check("H2 Browse button present", page.get_by_role("link", name="Browse categories").count() == 1)
    trust_n = page.locator('section[aria-label="Why shop here"] li').count()
    check("H3 trust strip has 3 items", trust_n == 3, f"items={trust_n}")
    check(
        "H3b free-ship threshold from real constant",
        page.get_by_text(re.compile(r"Free shipping over \$35")).count() >= 1,
    )
    tiles = page.locator('#shop-by-category a[href^="/c/"]')
    check("H4 category tiles present", tiles.count() >= 4, f"tiles={tiles.count()}")
    check(
        "H4b tiles show real product counts",
        re.search(r"\d+ products", page.locator("#shop-by-category").inner_text()) is not None,
    )
    top_rail = page.locator('section[aria-label="Top rated"]')
    check(
        "H5 Top rated rail with See all",
        top_rail.count() == 1 and top_rail.get_by_role("link", name="See all →").count() == 1,
    )
    check("H6 Deals rail present", page.locator('section[aria-label="Deals"]').count() == 1)
    group_rails = page.locator('section[aria-label^="Top rated in "]').count()
    check("H7 per-group rails present", group_rails >= 4, f"rails={group_rails}")

    resp = page.request.get(f"{BASE}/")
    home_kb = len(resp.body()) / 1024
    check("H8 home HTML size reported", home_kb < 800, f"{home_kb:.1f} KB")

    page.evaluate("() => window.scrollTo(0, document.body.scrollHeight)")
    page.wait_for_timeout(2500)
    page.evaluate("() => window.scrollTo(0, 0)")
    page.wait_for_timeout(500)
    page.screenshot(path=os.path.join(EV, "06-home.png"), full_page=True)

    page.set_viewport_size({"width": 390, "height": 844})
    page.reload(wait_until="domcontentloaded")
    page.wait_for_timeout(900)
    sw_home = page.evaluate("() => document.documentElement.scrollWidth")
    check("H9 home at 390: no horizontal scroll", sw_home <= 391, f"scrollWidth={sw_home}")
    page.screenshot(path=os.path.join(EV, "06-home-mobile.png"), full_page=False)
    page.set_viewport_size({"width": 1280, "height": 900})

    pdp = pdp_a or "/p/huawei-matebook-x-pro"
    page.goto(BASE + pdp, wait_until="domcontentloaded")
    page.wait_for_timeout(900)
    page.screenshot(path=os.path.join(EV, "08-product.png"), full_page=True)
    page.set_viewport_size({"width": 390, "height": 844})
    page.reload(wait_until="domcontentloaded")
    page.wait_for_timeout(900)
    sw_pdp = page.evaluate("() => document.documentElement.scrollWidth")
    check("H10 product page at 390: no horizontal scroll", sw_pdp <= 391, f"scrollWidth={sw_pdp}")
    page.screenshot(path=os.path.join(EV, "08-product-mobile.png"), full_page=True)

    browser.close()

fails = [r for r in results if r[0] == "FAIL"]
print("\n==== SUMMARY ====")
print(f"total={len(results)} pass={len(results) - len(fails)} fail={len(fails)}")
for f in fails:
    print("FAIL:", f[1], "->", f[2])
sys.exit(1 if fails else 0)
