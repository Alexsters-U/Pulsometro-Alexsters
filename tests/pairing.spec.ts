import { test, expect } from "@playwright/test";
import { defaultDesign } from "../shared/domain";

const ingest = { Authorization: `Bearer ${"i".repeat(40)}` };

test.beforeEach(async ({ page }) => {
  await page.request.post("/api/session", {
    headers: { Authorization: `Bearer ${"a".repeat(40)}` },
  });
  await page.request.put("/api/design", { data: defaultDesign });
});

test("a one-time QR pairs the app, then OBS presence and band battery reach the editor and the sender", async ({
  page,
  browser,
  request,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Conexiones", exact: true })
    .click();
  await page.getByRole("button", { name: "Mostrar codigo QR" }).click();
  const qr = page.getByRole("img", { name: "Codigo QR de vinculacion" });
  await expect(qr).toBeVisible();
  await expect(qr).toHaveAttribute("src", /^data:image\/svg\+xml/);
  await expect(page.getByRole("timer")).toContainText(/Caduca en [12]:\d\d/);
  await page.screenshot({ path: testInfo.outputPath("pairing-qr.png"), fullPage: true });

  // La app lee el mismo enlace que contiene el QR.
  const created = await page.request.post("/api/pairing");
  const { code, link } = await created.json();
  expect(link).toContain(`/pair#code=${code}`);
  await expect(qr).toBeVisible();
  const paired = await request.post("/api/pair", { data: { code, device: "Xiaomi 14T" } });
  expect(paired.status()).toBe(200);
  expect((await paired.json()).ingestToken).toBe("i".repeat(40));
  await expect(qr).toBeHidden();
  await expect(page.getByRole("status", { name: "Avisos" })).toHaveText(
    "App vinculada: Xiaomi 14T.",
  );

  // Una fuente que se comporta como el navegador de OBS.
  const obsContext = await browser.newContext({ viewport: { width: 600, height: 240 } });
  try {
    await obsContext.addInitScript(() => {
      (window as unknown as { obsstudio: unknown }).obsstudio = {
        pluginVersion: "2.24.0",
        getStatus: (callback: (status: { streaming: boolean }) => void) => callback({ streaming: true }),
      };
    });
    const obs = await obsContext.newPage();
    obs.on("pageerror", (error) => errors.push(error.message));
    await obs.goto(`/overlay?token=${"o".repeat(40)}`);
    await expect(page.getByTestId("overlay-count")).toHaveText("1 (1 en OBS)");
    await expect(page.getByTestId("overlay-live")).toHaveText("Sin confirmar");
    await obs.evaluate(() =>
      window.dispatchEvent(new CustomEvent("obsSourceActiveChanged", { detail: { active: true } })),
    );
    await expect(page.getByTestId("overlay-live")).toHaveText("Si");
    await expect(page.getByText("En directo", { exact: true })).toBeVisible();

    const posted = await request.post("/api/pulse", {
      headers: ingest,
      data: { bpm: 96, device: "KYOTO 2809_15CF", battery: 64 },
    });
    expect(await posted.json()).toEqual({
      ok: true,
      viewers: { overlays: 1, obs: 1, live: 1, streaming: true, editors: 1 },
    });
    await expect(page.getByTestId("band-battery")).toHaveText("64 %");
    await expect(obs.locator(".bpmNumber")).toHaveText("96");

    await obs.evaluate(() =>
      window.dispatchEvent(new CustomEvent("obsSourceActiveChanged", { detail: { active: false } })),
    );
    await expect(page.getByTestId("overlay-live")).toHaveText("Sin confirmar");
    await obs.close();
    await expect(page.getByTestId("overlay-count")).toHaveText("0 (0 en OBS)");
  } finally {
    await obsContext.close();
  }
  expect(errors).toEqual([]);
});

test("the phone camera fallback page opens the app with the code from the fragment", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/pair#code=AbCdEfGhIjKlMnOpQrStUvWxYz012345");
  const open = page.getByRole("link", { name: "Abrir en Alexsters Pulse" });
  await expect(open).toHaveAttribute(
    "href",
    /^alexsters-pulse:\/\/pair\?origin=http%3A%2F%2F127\.0\.0\.1%3A18764&code=AbCdEfGhIjKlMnOpQrStUvWxYz012345$/,
  );
  await page.screenshot({ path: testInfo.outputPath("pair-page-mobile.png"), fullPage: true });
  await page.goto("/pair");
  await expect(page.getByText("Este enlace no contiene un codigo valido", { exact: false })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
});
