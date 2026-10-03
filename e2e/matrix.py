"""Playwright verification matrix. Run against a production server on :3000.

Usage: npm run e2e   (server must already run: npm run start)
"""
import os
import re
import sys
import urllib.parse

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from playwright.sync_api import sync_playwright

BASE = os.environ.get("E2E_BASE_URL", "http://localhost:3000")
EV = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "docs", "evidence")

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

    browser.close()

fails = [r for r in results if r[0] == "FAIL"]
print("\n==== SUMMARY ====")
print(f"total={len(results)} pass={len(results) - len(fails)} fail={len(fails)}")
for f in fails:
    print("FAIL:", f[1], "->", f[2])
sys.exit(1 if fails else 0)
