import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFile } from "node:fs/promises";
import { parseData } from "../../src/lib/data";

const sample =
  'name,team,note\r\n"  Ada Example  ","  Design  ","Line one\nLine two"\r\n"  Tayo Sample  ","  Research  ","SYNTHETIC fixture"\r\n';
const cleaned =
  'name,team,note\r\nAda Example,Design,"Line one\nLine two"\r\nTayo Sample,Research,SYNTHETIC fixture\r\n';
async function openCsv(page: Page) {
  await page.goto("/data");
  await page
    .getByLabel("Read a UTF-8 file locally")
    .setInputFiles({
      name: "synthetic.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(sample),
    });
  await page.getByRole("button", { name: "Validate & open" }).click();
}
async function download(page: Page, button: string) {
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: button, exact: true }).click();
  const file = await pending;
  return {
    name: file.suggestedFilename(),
    text: await readFile((await file.path())!, "utf8"),
  };
}
async function accessibility(page: Page) {
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
}

test("CSV file -> review -> apply -> download -> compare -> undo/reset, with screenshots", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await openCsv(page);
  await expect(page.getByLabel("Original CSV")).toHaveAttribute("readonly");
  await page
    .getByRole("button", { name: "Preview transformation", exact: true })
    .click();
  await expect(page.locator(".change-summary")).toContainText("4 changed");
  const review = JSON.parse(
    (await download(page, "Download change review")).text,
  );
  expect(review.direction).toBe("current -> proposed step (not applied)");
  expect(review.changed).toBe(4);
  expect(review.changes[0]).toEqual({
    path: "Record 2 / column 1",
    kind: "changed",
    before: "  Ada Example  ",
    after: "Ada Example",
  });
  expect((await download(page, "Download CSV result")).text).toContain(
    "  Ada Example  ",
  );
  await page
    .getByRole("button", { name: "Apply reviewed transformation" })
    .click();
  const result = await download(page, "Download CSV result");
  expect(result.name).toBe("smallwork-cleaned.csv");
  expect(result.text).toBe(cleaned);
  expect(parseData(result.text, "csv").issues).toEqual([]);
  await expect(page.getByLabel("Original CSV")).toHaveValue(
    sample.replace(/\r\n/g, "\n"),
  );
  await page
    .getByLabel("Comparison CSV")
    .fill(cleaned.replace("Research", "Editorial").replace(/\r\n/g, "\n"));
  await page.getByRole("button", { name: "Compare versions" }).click();
  await expect(page.locator(".change-summary").last()).toContainText(
    "1 changed",
  );
  const report = JSON.parse(
    (await download(page, "Download full diff report")).text,
  );
  expect(report.changes).toEqual([
    {
      path: "Record 3 / column 2",
      kind: "changed",
      before: "Research",
      after: "Editorial",
    },
  ]);
  await accessibility(page);
  if (info.project.name === "mobile") {
    const table = page.getByRole("region", { name: "Cleanup changes" });
    await table.focus();
    await page.keyboard.press("ArrowRight");
    await expect
      .poll(() => table.evaluate((element) => element.scrollLeft))
      .toBeGreaterThan(0);
    await table.evaluate((element) => {
      element.scrollLeft = 0;
    });
  }
  await page.screenshot({
    path: `docs/data-${info.project.name}.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "Undo last change" }).click();
  await expect(
    page.getByRole("button", { name: "Download full diff report" }),
  ).toHaveCount(0);
  expect((await download(page, "Download CSV result")).text).toContain(
    "  Ada Example  ",
  );
  await page
    .getByLabel("Columns to change")
    .selectOption({ label: "Column 1: name" });
  await page
    .getByRole("button", { name: "Preview transformation", exact: true })
    .click();
  await expect(page.locator(".change-summary")).toContainText("2 changed");
  await page
    .getByRole("button", { name: "Apply reviewed transformation" })
    .click();
  await page.getByRole("button", { name: "Reset changes" }).click();
  expect((await download(page, "Download CSV result")).text).toContain(
    "  Design  ",
  );
  expect(errors).toEqual([]);
});

test("JSON duplicate errors, lossless cleanup, safe keys, structured diff and report", async ({
  page,
}, info) => {
  await page.goto("/data");
  await page.getByLabel("Format", { exact: true }).selectOption("json");
  await page.getByLabel("Original JSON").fill('{"id":1,"id":2}');
  await page.getByRole("button", { name: "Validate & open" }).click();
  await expect(page.getByRole("alert")).toContainText("Duplicate object key");
  await expect(
    page.getByRole("button", { name: "Download JSON result" }),
  ).toHaveCount(0);
  const source =
    '{"name":"  Ada Example  ","id":900719925474099312345,"active":true,"tags":["  Research  "],"notes":null,"__proto__":{"sample":" inert "}}';
  await page
    .getByLabel("Read a UTF-8 file locally")
    .setInputFiles({
      name: "synthetic.json",
      mimeType: "application/json",
      buffer: Buffer.from(source),
    });
  await page.getByRole("button", { name: "Validate & open" }).click();
  await page
    .getByRole("button", { name: "Preview transformation", exact: true })
    .click();
  await expect(page.locator(".change-summary")).toContainText("3 changed");
  await page
    .getByRole("button", { name: "Apply reviewed transformation" })
    .click();
  const result = (await download(page, "Download JSON result")).text;
  expect(result).toContain("900719925474099312345");
  expect(result).toContain('"__proto__":{"sample":"inert"}');
  expect(result).toContain('"notes":null');
  expect(
    await page.evaluate(() => Object.hasOwn(Object.prototype, "sample")),
  ).toBe(false);
  const right =
    '{"name":"Ada Example","id":900719925474099312345,"active":false,"tags":["Research","Editorial"],"__proto__":{"sample":"inert"},"revision":2}';
  await page.getByLabel("Comparison JSON").fill(right);
  await page.getByRole("button", { name: "Compare versions" }).click();
  await expect(page.locator(".change-summary").last()).toContainText(
    "1 changed · 2 added · 1 removed",
  );
  const report = JSON.parse(
    (await download(page, "Download full diff report")).text,
  );
  expect(
    report.changes.find((change: { path: string }) => change.path === "/notes"),
  ).toEqual({ path: "/notes", kind: "removed", before: "null" });
  await accessibility(page);
  await page
    .locator('section[aria-labelledby="diff-title"]')
    .screenshot({ path: `docs/diff-${info.project.name}.png` });
  await page.getByLabel("Comparison JSON").fill("{broken");
  await expect(
    page.getByRole("button", { name: "Download full diff report" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Compare versions" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Comparison input needs correction",
  );
});

test("Malformed CSV, invalid UTF-8, oversized files, and formula-risk downloads are explicit", async ({
  page,
}) => {
  await page.goto("/data");
  await page.getByLabel("Original CSV").fill("a,b\nonly");
  await page.getByRole("button", { name: "Validate & open" }).click();
  await expect(page.getByRole("alert")).toContainText("Record 2, line 2");
  await expect(
    page.getByRole("button", { name: "Download CSV result" }),
  ).toHaveCount(0);
  await page
    .getByLabel("Read a UTF-8 file locally")
    .setInputFiles({
      name: "invalid.csv",
      mimeType: "text/csv",
      buffer: Buffer.from([0xff, 0xfe, 0x41]),
    });
  await expect(page.getByRole("alert").first()).toContainText(
    "not valid UTF-8",
  );
  await expect(page.getByLabel("Original CSV")).toHaveValue("a,b\nonly");
  await page
    .getByLabel("Read a UTF-8 file locally")
    .setInputFiles({
      name: "large.csv",
      mimeType: "text/csv",
      buffer: Buffer.alloc(262145, 65),
    });
  await expect(page.getByRole("alert").first()).toContainText(
    "exceeds 256 KiB",
  );
  await expect(page.getByLabel("Original CSV")).toHaveValue("a,b\nonly");
  await page.getByLabel("Original CSV").fill("A".repeat(262145));
  await expect(page.getByRole("alert").first()).toContainText(
    "This edit was rejected",
  );
  await expect(page.getByLabel("Original CSV")).toHaveValue("a,b\nonly");
  const blocked = await page.getByLabel("Original CSV").evaluate((element) => {
    const clipboardData = new DataTransfer();
    clipboardData.setData("text/plain", "x".repeat(262145));
    const event = new ClipboardEvent("paste", {
      clipboardData,
      bubbles: true,
      cancelable: true,
    });
    element.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(blocked).toBe(true);
  await expect(page.getByRole("alert").first()).toContainText(
    "Nothing was pasted",
  );
  await page.getByLabel("Original CSV").fill("=header,note\nAda, =1+1");
  await page.getByRole("button", { name: "Validate & open" }).click();
  await expect(page.locator(".formula-warning")).toContainText(
    "2 formula-like CSV cells",
  );
  await expect(
    page.getByRole("button", { name: "Download CSV result" }),
  ).toBeDisabled();
  await page.getByLabel("I understand the formula risk").check();
  expect((await download(page, "Download CSV result")).text).toBe(
    "=header,note\nAda, =1+1",
  );
  await page
    .getByLabel("Transformation", { exact: true })
    .selectOption("guard");
  await page.getByLabel("Protect the first record as a header").uncheck();
  await page
    .getByRole("button", { name: "Preview transformation", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Apply reviewed transformation" })
    .click();
  await expect(page.locator(".formula-warning")).toHaveCount(0);
  expect((await download(page, "Download CSV result")).text).toBe(
    "'=header,note\nAda,' =1+1",
  );
  await page.getByRole("button", { name: "Undo last change" }).click();
  await expect(
    page.getByRole("button", { name: "Download CSV result" }),
  ).toBeDisabled();
  await expect(
    page.getByLabel("I understand the formula risk"),
  ).not.toBeChecked();
  await accessibility(page);
});

test("No data requests or storage, escaped HTML, stale previews, recovery and reload clearing", async ({
  page,
}) => {
  const requests: string[] = [];
  page.on("request", (request) =>
    requests.push(request.method() + " " + request.url()),
  );
  const response = await page.goto("/data");
  expect(response?.headers()["content-security-policy"]).toContain(
    "connect-src 'none'",
  );
  await page
    .getByLabel("Original CSV")
    .fill('value\n"  <img src=x onerror=alert(1)>  "');
  await page.getByRole("button", { name: "Validate & open" }).click();
  await page
    .getByRole("button", { name: "Preview transformation", exact: true })
    .click();
  await page
    .getByLabel("Transformation", { exact: true })
    .selectOption("upper");
  await expect(
    page.getByRole("button", { name: "Apply reviewed transformation" }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Preview transformation", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Apply reviewed transformation" })
    .click();
  await expect(page.locator(".tool img")).toHaveCount(0);
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "Edit original source" }).click();
  await expect(
    page.getByLabel("Current result (applied changes only)"),
  ).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Edit original source" }).click();
  await expect(page.getByLabel("Original CSV")).toHaveValue(
    'value\n"  <img src=x onerror=alert(1)>  "',
  );
  expect(
    await page.evaluate(() => ({
      local: localStorage.length,
      session: sessionStorage.length,
    })),
  ).toEqual({ local: 0, session: 0 });
  expect(await page.context().cookies()).toEqual([]);
  expect(
    requests.every((request) =>
      request.startsWith("GET http://127.0.0.1:5310/"),
    ),
  ).toBe(true);
  expect(
    requests.some((request) => /[?]|src=x|Ada|onerror/.test(request)),
  ).toBe(false);
  await page.reload();
  await expect(page.getByLabel("Original CSV")).toHaveValue("");
  await expect(
    page.getByRole("button", { name: "Download CSV result" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Load synthetic example" }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Clear workspace" }).click();
  await expect(page.getByLabel("Original CSV")).toHaveValue("");
});

test("Existing calculator, cipher and word studio remain usable", async ({
  page,
}) => {
  await page.goto("/calculator");
  await page.getByLabel("Your expression").fill("(24+18)*2");
  await page.getByRole("button", { name: "Calculate" }).click();
  await expect(page.locator("output")).toHaveText("84");
  await page.getByRole("link", { name: /Caesar cipher/ }).click();
  await page.getByLabel("Your message").fill("Zebra! 123");
  await page.getByRole("button", { name: "Transform message" }).click();
  await expect(page.locator("output")).toHaveText("Cheud! 123");
  await page.getByRole("link", { name: /Word studio/ }).click();
  await page.getByLabel("Your text").fill("  a   b \n c  ");
  await page.getByRole("button", { name: "Tidy spacing" }).click();
  await expect(page.getByLabel("Formatted text")).toHaveValue("a b\nc");
  await accessibility(page);
  await page.getByRole("link", { name: /Data bench/ }).click();
  await expect(
    page.getByRole("heading", { name: "Clean it. Compare it. Keep control." }),
  ).toBeVisible();
});
