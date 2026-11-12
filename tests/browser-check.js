/* End-to-end check in a real browser (needs Playwright: `npm i --no-save playwright@1.56.1`).
 * Serves the site at /prayercalendar/ as GitHub Pages does and drives it the way a
 * visitor would: pick a place (city, coordinates, location), change dates and settings,
 * download the file. Asserts no script errors, no Content Security Policy violations,
 * no request leaving the page's own files, and no sideways scrolling at desktop or
 * phone width. Screenshots go to test-results/screenshots/.
 *
 * The shared theme, settings panel and night sky live in the portfolio repo
 * (areeb-ece.github.io, public/design/). Without them the page falls back to its own
 * light/dark switch and its copy of the shared tokens and components (assets/design/),
 * which is what runs by default. To check the real thing:
 *   DESIGN_DIR=../areeb-ece.github.io/public/design npm run test:browser */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASE_PATH = "/prayercalendar/";
const DESIGN = process.env.DESIGN_DIR && path.resolve(process.env.DESIGN_DIR);
const SHOTS = path.join(ROOT, "test-results", "screenshots");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".json": "application/json", ".txt": "text/plain" };

const server = http.createServer((req, res) => {
  const url = decodeURIComponent(new URL(req.url, "http://x").pathname);
  let file = null, base = ROOT;
  if (url.startsWith("/design/") && !DESIGN) { // as if the portfolio weren't there: empty files
    res.writeHead(200, { "Content-Type": TYPES[path.extname(url)] || "text/plain" }); res.end(); return;
  }
  if (url.startsWith("/design/")) { file = path.join(DESIGN, path.basename(url)); base = DESIGN; }
  else if (url.startsWith("/fonts/") && DESIGN) { file = path.join(DESIGN, "..", "fonts", path.basename(url)); base = path.dirname(DESIGN); }
  else if (url.startsWith(BASE_PATH)) file = path.join(ROOT, url.slice(BASE_PATH.length) || "index.html");
  if (file && file.endsWith(path.sep)) file += "index.html";
  if (!file || !file.startsWith(base) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});

await new Promise((r) => server.listen(0, "127.0.0.1", r));
const origin = `http://127.0.0.1:${server.address().port}`;
const url = origin + BASE_PATH;
const opts = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {};
const browser = await chromium.launch(opts);
fs.mkdirSync(SHOTS, { recursive: true });
const tag = DESIGN ? "shared" : "offline";
let failed = false;

async function open(viewport, extra = {}) {
  const context = await browser.newContext({ viewport, acceptDownloads: true, timezoneId: "America/Toronto", ...extra });
  const page = await context.newPage();
  const errors = [], outside = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("request", (r) => { if (!r.url().startsWith(origin) && !r.url().startsWith("data:") && !r.url().startsWith("blob:")) outside.push(r.url()); });
  await page.addInitScript(() => {
    window.__csp = [];
    document.addEventListener("securitypolicyviolation", (e) => window.__csp.push(e.violatedDirective + " " + e.blockedURI));
  });
  await page.goto(url);
  const done = async (name) => {
    const wide = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
    assert.ok(wide[0] <= wide[1] + 1, `${name} scrolls sideways: ${wide}`);
    assert.deepEqual(errors, [], `${name}: script errors`);
    assert.deepEqual(await page.evaluate(() => window.__csp), [], `${name}: CSP violations`);
    assert.deepEqual(outside, [], `${name}: requests outside the site`);
  };
  return { context, page, done };
}

try {
  // ── desktop: the whole flow ──
  {
    const { context, page, done } = await open({ width: 1360, height: 900 });
    assert.ok(await page.isVisible("#empty"), "asks for a place first");
    assert.ok(await page.isDisabled("#btnDownload"));
    if (DESIGN) {
      assert.ok(await page.isVisible("#designSettings"), "shared settings button");
      assert.ok(await page.isHidden("#btnTheme"), "fallback switch hidden");
      assert.ok((await page.$$eval("#stage .sky circle", (c) => c.length)) > 0, "stars behind the sheet");
    } else {
      assert.ok(await page.isVisible("#btnTheme"), "offline light/dark switch");
      await page.click("#btnTheme");
      assert.equal(await page.getAttribute("html", "data-theme"), "light");
      await page.click("#btnTheme");
    }
    await page.screenshot({ path: path.join(SHOTS, `${tag}-desktop-empty.png`) });

    await page.fill("#city", "Oshawa, Canada");
    await page.press("#city", "Enter");
    await page.waitForSelector("#sheet:not([hidden])");
    assert.equal(await page.textContent("#tbPlace"), "Oshawa, Canada");
    assert.equal(await page.locator("#times tbody tr[data-date]").count(), 30, "30 days by default");
    assert.ok(await page.isEnabled("#btnDownload"));
    assert.ok((await page.locator("#timeline .bar-ev").count()) >= 8, "the day's windows on the timeline");
    const names = await page.$$eval("#dayList .n", (n) => n.map((x) => x.textContent));
    for (const n of ["Fajr", "Makrooh: sunrise", "Makrooh: istiwa", "Dhuhr", "Asr", "Makrooh: sunset", "Maghrib", "Isha"]) assert.ok(names.includes(n), `day list has ${n}`);
    await page.screenshot({ path: path.join(SHOTS, `${tag}-desktop-oshawa.png`) });

    // a year, both Asr times, the gap and the last third switched on
    await page.click('[data-preset="12"]');
    assert.ok((await page.locator("#times tbody tr[data-date]").count()) >= 365);
    await page.click('#asr button[data-v="both"]');
    assert.ok(await page.isVisible("#bothOpts"));
    assert.ok(await page.isVisible('[data-ev="asr1"]') && await page.isVisible('[data-ev="asr2"]') && await page.isHidden('[data-ev="asr"]'));
    await page.check('[data-ev="gap"] [data-ev-on]');
    await page.check('[data-ev="third"] [data-ev-on]');
    await page.waitForTimeout(50);
    const heads = await page.$$eval("#times thead th", (t) => t.map((x) => x.textContent));
    assert.deepEqual(heads, ["Date", "Fajr", "Sunrise", "Dhuhr", "Asr (Mithl)", "Asr (Mithlain)", "Maghrib", "Isha"]);
    const dayNames = await page.$$eval("#dayList .n", (n) => n.map((x) => x.textContent));
    for (const n of ["Between Fajr and Dhuhr", "Asr (Mithl)", "Asr (Mithlain)", "Last third of the night"]) assert.ok(dayNames.includes(n), `day list has ${n}`);

    // custom angles make the method Custom
    await page.fill("#fajrAngle", "17");
    await page.waitForTimeout(250);
    assert.equal(await page.inputValue("#method"), "custom");
    await page.selectOption("#method", "mwl");
    assert.equal(await page.inputValue("#fajrAngle"), "18");

    // a reminder, then the file itself
    await page.selectOption('[data-ev="fajr"] [data-ev-alarm]', "10");
    const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#btnDownload")]);
    const ics = fs.readFileSync(await dl.path(), "utf8");
    assert.match(dl.suggestedFilename(), /^prayer-times-oshawa-canada-\d{4}-\d{2}-\d{2}-to-\d{4}-\d{2}-\d{2}\.ics$/);
    assert.ok(ics.startsWith("BEGIN:VCALENDAR\r\n") && ics.includes("SUMMARY:Asr (Mithlain)") && ics.includes("TRIGGER:-PT10M"));
    assert.ok(ics.split("BEGIN:VEVENT").length - 1 > 365 * 10, "a year of events");

    // the timetable as a PDF: paper, a page per month, extra columns
    await page.click("#btnPdf");
    assert.ok(await page.isVisible("#pdfDlg"), "PDF dialog opens");
    await page.click('#pdfPaper [data-v="a4"]');
    await page.check('[data-pdf-col="midnight"]');
    await page.check('[data-pdf-col="hijri"]');
    await page.screenshot({ path: path.join(SHOTS, `${tag}-desktop-pdf-dialog.png`) });
    const [pdfDl] = await Promise.all([page.waitForEvent("download"), page.click("#pdfGo")]);
    const pdf = fs.readFileSync(await pdfDl.path()).toString("latin1");
    assert.match(pdfDl.suggestedFilename(), /^prayer-times-oshawa-canada-.*\.pdf$/);
    assert.ok(pdf.startsWith("%PDF-1.4") && pdf.includes("(Oshawa, Canada) Tj") && pdf.includes("(Midnight) Tj") && pdf.includes("(Hijri) Tj"));
    assert.ok(pdf.includes("/MediaBox [0 0 595.28 841.89]"), "A4");
    assert.ok(+/\/Count (\d+)/.exec(pdf)[1] >= 12, "a page a month for 12 months");
    await page.waitForSelector("#pdfDlg", { state: "hidden", timeout: 2000 }); // it closes after saving (with a short fade)

    await page.click('#viewSeg [data-view="ics"]');
    assert.ok((await page.textContent("#viewIcs")).includes("X-WR-CALNAME:Prayer times"));
    await page.click('#viewSeg [data-view="table"]');

    // a date range over a year is refused with a reason
    await page.fill("#dEnd", "2099-01-01");
    await page.waitForTimeout(250);
    assert.match(await page.textContent("#rangeErr"), /up to a year/);
    assert.ok(await page.isDisabled("#btnDownload"));
    await page.click('[data-preset="30"]');

    // settings are remembered
    await page.reload();
    await page.waitForSelector("#sheet:not([hidden])");
    assert.equal(await page.textContent("#tbPlace"), "Oshawa, Canada");
    assert.equal(await page.getAttribute('#asr button[data-v="both"]', "aria-checked"), "true");

    // coordinates pasted into one field, far north in summer: the high-latitude note
    await page.click("#coordDisc summary");
    await page.fill("#lat", "59.91, 10.75");
    await page.selectOption("#tz", "Europe/Oslo");
    await page.fill("#dStart", "2027-06-01");
    await page.fill("#dEnd", "2027-06-30");
    await page.waitForTimeout(250);
    assert.equal(await page.inputValue("#lon"), "10.75");
    assert.ok(await page.isVisible("#pNotes"), "notes the high-latitude rule");
    assert.ok((await page.locator("#times .mark").count()) > 0, "marks the days");
    assert.match(await page.textContent("#tbSub"), /Europe\/Oslo|Oslo time/);
    await page.screenshot({ path: path.join(SHOTS, `${tag}-desktop-oslo.png`) });

    if (DESIGN) {
      await page.evaluate(() => SiteDesign.set({ theme: "light" }));
      await page.screenshot({ path: path.join(SHOTS, `${tag}-desktop-light.png`) });
      await page.evaluate(() => SiteDesign.reset());
    }
    await page.click("#btnReset");
    assert.ok(await page.isVisible("#empty"), "reset forgets the place");
    await done("desktop");
    await context.close();
  }

  // ── phone: location from the browser ──
  {
    const { context, page, done } = await open({ width: 390, height: 844 }, { geolocation: { latitude: 43.9455, longitude: -78.8968 }, permissions: ["geolocation"], isMobile: true, hasTouch: true });
    await page.click('[data-action="locate"]');
    await page.waitForSelector("#sheet:not([hidden])");
    assert.equal(await page.textContent("#tbPlace"), "Near Oshawa, Canada");
    await page.click("#dNext");
    await page.screenshot({ path: path.join(SHOTS, `${tag}-phone.png`), fullPage: true });
    await done("phone");
    await context.close();
  }
  console.log(`browser check passed (${tag})`);
} catch (e) {
  failed = true;
  console.error(e);
} finally {
  await browser.close();
  server.close();
}
process.exit(failed ? 1 : 0);
