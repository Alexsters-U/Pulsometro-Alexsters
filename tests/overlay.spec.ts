import { test, expect } from "@playwright/test";
import { defaultDesign } from "../shared/domain";
import { themes, themeIds } from "../shared/themes";

test("saved designs and authenticated BPM reach an independent OBS browser", async ({
  page,
  browser,
  request,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await page.getByLabel("Clave de administracion").fill("a".repeat(40));
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(
    page.getByRole("radio", { name: themes.neon.label, exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("radio", { name: themes.neon.label, exact: true })
    .check();
  await page.getByRole("button", { name: "Guardar diseno" }).click();
  await expect(page.getByRole("status", { name: "Avisos" })).toHaveText(
    "Diseno guardado.",
  );
  await page.screenshot({
    path: testInfo.outputPath("editor-desktop.png"),
    fullPage: true,
  });
  const obsContext = await browser.newContext({
    viewport: { width: 800, height: 400 },
  });
  try {
    const obs = await obsContext.newPage();
    obs.on("pageerror", (error) => errors.push(error.message));
    await obs.goto(`/overlay?token=${"o".repeat(40)}`);
    await expect(obs.locator(".overlayRoot")).toHaveClass(/neon/);
    await expect(obs.locator(".bpmNumber")).toHaveText("--");
    const posted = await request.post("/api/pulse", {
      headers: { Authorization: `Bearer ${"i".repeat(40)}` },
      data: { bpm: 132, device: "KYOTO" },
    });
    expect(posted.ok()).toBeTruthy();
    await expect(obs.locator(".bpmNumber")).toHaveText("132");
    await page
      .getByRole("radio", { name: themes.crystal.label, exact: true })
      .check();
    await page.getByRole("button", { name: "Guardar diseno" }).click();
    await expect(obs.locator(".overlayRoot")).toHaveClass(/crystal/);
    const bounds = await obs.locator(".overlayRoot").boundingBox();
    expect(bounds!.x).toBeGreaterThan(0);
    expect(bounds!.y).toBeGreaterThan(0);
    expect(
      await obs.evaluate(() => getComputedStyle(document.body).backgroundColor),
    ).toBe("rgba(0, 0, 0, 0)");
    await obs.screenshot({
      path: testInfo.outputPath("overlay.png"),
      omitBackground: true,
    });
    for (const width of [900, 375]) {
      await page.setViewportSize({ width, height: 900 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBeTruthy();
    }
    await page.screenshot({
      path: testInfo.outputPath("editor-mobile.png"),
      fullPage: true,
    });
    await page.getByRole("button", { name: "Cerrar sesion" }).click();
    await expect(
      page.getByRole("button", { name: "Entrar", exact: true }),
    ).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    await obsContext.close();
  }
});

test("all four asset themes have a continuous BPM heartbeat, smaller independent digits and responsive frames", async ({
  page,
}, testInfo) => {
  await page.request.post("/api/session", {
    headers: { Authorization: `Bearer ${"a".repeat(40)}` },
  });
  await page.request.put("/api/design", { data: defaultDesign });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await expect(
    page.getByRole("radio", { name: themes.minecraft.label, exact: true }),
  ).toBeEnabled();
  expect(
    await page
      .getByRole("radiogroup", { name: "Tema", exact: true })
      .locator("input")
      .evaluateAll((nodes) =>
        nodes.map((node) => (node as HTMLInputElement).value),
      ),
  ).toEqual([...themeIds]);
  await page.getByLabel("Automatico").uncheck();
  async function setBpm(bpm: number) {
    await page
      .getByLabel("BPM de prueba")
      .evaluate((node: HTMLInputElement, value) => {
        Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          "value",
        )!.set!.call(node, String(value));
        node.dispatchEvent(new Event("input", { bubbles: true }));
      }, bpm);
    await expect(page.locator(".bpmNumber")).toHaveText(String(bpm));
  }
  await setBpm(60);
  const heart = page.locator(".heartBeat");
  await expect
    .poll(() => heart.evaluate((node) => node.getAnimations()[0]?.playbackRate))
    .toBe(1);
  await heart.evaluate((node) => {
    const animation = node.getAnimations()[0];
    animation.pause();
    animation.currentTime = 0;
    (window as unknown as { heartbeat: Animation }).heartbeat = animation;
  });
  const contracted = await heart.boundingBox();
  await heart.evaluate((node) => {
    node.getAnimations()[0].currentTime = 160;
  });
  const expanded = await heart.boundingBox();
  expect(expanded!.width).toBeGreaterThan(contracted!.width * 1.1);
  await heart.evaluate((node) => {
    node.getAnimations()[0].play();
  });
  await setBpm(120);
  await expect
    .poll(() => heart.evaluate((node) => node.getAnimations()[0]?.playbackRate))
    .toBe(2);
  expect(
    await heart.evaluate(
      (node) =>
        node.getAnimations()[0] ===
        (window as unknown as { heartbeat: Animation }).heartbeat,
    ),
  ).toBe(true);
  const counter = page.locator(".bpmNumber");
  expect(
    await counter.evaluate((node) =>
      Number.parseFloat(getComputedStyle(node).fontSize),
    ),
  ).toBeLessThanOrEqual(80);
  expect(
    await page
      .locator(".overlayRoot")
      .evaluate((node) => getComputedStyle(node).animationName),
  ).toBe("none");

  for (const theme of themeIds) {
    await page
      .getByRole("radio", { name: themes[theme].label, exact: true })
      .check();
    const sprite = page.locator(".heartSprite");
    await expect(sprite).toHaveAttribute(
      "src",
      theme === "minecraft"
        ? "/assets/hearts/phases/accelerated-v1.png"
        : themes[theme].asset,
    );
    await expect
      .poll(() =>
        sprite.evaluate(
          (node: HTMLImageElement) => node.complete && node.naturalWidth > 0,
        ),
      )
      .toBe(true);
    await page.evaluate(() => document.fonts.ready);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page
      .locator(".previewStage")
      .screenshot({
        path: testInfo.outputPath(`theme-${theme}.png`),
        animations: "disabled",
      });
    for (const width of [900, 375, 320]) {
      await page.setViewportSize({ width, height: 900 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      const iconBox = await page.locator(".pulseIcon").boundingBox();
      const digitsBox = await page.locator(".bpmGroup").boundingBox();
      expect(iconBox!.x + iconBox!.width).toBeLessThanOrEqual(digitsBox!.x);
      expect(
        await counter.evaluate((node) => {
          const style = getComputedStyle(node);
          const canvas = document.createElement("canvas");
          const context = canvas.getContext("2d")!;
          context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
          const textWidth = context.measureText(node.textContent ?? "").width;
          const stage = document
            .querySelector(".previewStage")!
            .getBoundingClientRect();
          const counterBox = node.getBoundingClientRect();
          const layoutWidth = (node as HTMLElement).offsetWidth;
          const scale = counterBox.width / layoutWidth;
          return (
            textWidth <= layoutWidth &&
            counterBox.x + textWidth * scale + 4 <= stage.right
          );
        }),
      ).toBe(true);
    }
    await page.screenshot({
      path: testInfo.outputPath(`mobile-${theme}.png`),
      fullPage: true,
      animations: "disabled",
    });
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect
    .poll(() => heart.evaluate((node) => node.getAnimations().length))
    .toBe(0);
  expect(
    await counter.evaluate((node) => getComputedStyle(node).animationName),
  ).toBe("none");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect
    .poll(() => heart.evaluate((node) => node.getAnimations()[0]?.playbackRate))
    .toBe(2);
});

test("Minecraft totem pops on a threshold crossing with decoded audio and a manual preview", async ({
  page,
  browser,
  request,
}, testInfo) => {
  await request.post("/api/session", {
    headers: { Authorization: `Bearer ${"a".repeat(40)}` },
  });
  await request.put("/api/design", { data: defaultDesign });
  async function send(bpm: number) {
    expect(
      (
        await request.post("/api/pulse", {
          headers: { Authorization: `Bearer ${"i".repeat(40)}` },
          data: { bpm, device: "KYOTO" },
        })
      ).ok(),
    ).toBeTruthy();
  }
  await send(145);
  const recording = await browser.newContext({
    viewport: { width: 600, height: 240 },
    ...(process.env.RECORD_TOTEM
      ? {
          recordVideo: {
            dir: testInfo.outputPath("video"),
            size: { width: 600, height: 240 },
          },
        }
      : {}),
  });
  try {
    const obs = await recording.newPage();
    await obs.addInitScript(() => {
      const original = HTMLMediaElement.prototype.play;
      (window as unknown as { audioCalls: number }).audioCalls = 0;
      HTMLMediaElement.prototype.play = function () {
        (window as unknown as { audioCalls: number }).audioCalls++;
        return original.call(this);
      };
    });
    await obs.goto(`http://127.0.0.1:18764/overlay?token=${"o".repeat(40)}`);
    await expect(obs.locator(".phaseSprite")).toHaveAttribute(
      "src",
      /natanael-totem-idle-v1.png$/,
    );
    await expect(obs.locator(".pulseIcon")).toHaveAttribute(
      "data-totem-pops",
      "0",
    );
    await expect
      .poll(() =>
        obs
          .locator("audio")
          .evaluate((node: HTMLAudioElement) => node.readyState),
      )
      .toBeGreaterThanOrEqual(2);
    await obs.mouse.click(550, 200);
    await send(130);
    await expect(obs.locator(".phaseSprite")).toHaveAttribute(
      "src",
      /accelerated-v1.png$/,
    );
    await send(140);
    await expect(obs.locator(".pulseIcon")).toHaveAttribute(
      "data-totem-pops",
      "1",
    );
    await expect(obs.locator(".totemBurst")).toBeVisible();
    await expect(obs.locator(".totemSprite")).toHaveAttribute(
      "src",
      /natanael-totem-open-v1.png$/,
    );
    await expect
      .poll(() =>
        obs
          .locator("audio")
          .evaluate((node: HTMLAudioElement) => node.currentTime),
      )
      .toBeGreaterThan(0);
    expect(
      await obs.evaluate(
        () => (window as unknown as { audioCalls: number }).audioCalls,
      ),
    ).toBe(1);
    const image = obs.locator(".totemSprite");
    await expect
      .poll(() => image.evaluate((node: HTMLImageElement) => node.naturalWidth))
      .toBeGreaterThan(0);
    await expect
      .poll(
        () =>
          image.evaluate((node) =>
            Number(node.getAnimations()[0]?.currentTime ?? 0),
          ),
        { intervals: [40] },
      )
      .toBeGreaterThan(260);
    await obs.screenshot({
      path: testInfo.outputPath("totem-pop.png"),
      omitBackground: true,
    });
    await send(150);
    await send(139);
    await expect(obs.locator(".bpmNumber")).toHaveText("139");
    await send(141);
    await expect(obs.locator(".bpmNumber")).toHaveText("141");
    await expect(obs.locator(".pulseIcon")).toHaveAttribute(
      "data-totem-pops",
      "1",
    );
    await expect(obs.locator(".totemBurst")).toHaveCount(0);
    await expect(obs.locator(".totemSprite")).toHaveAttribute(
      "src",
      /natanael-totem-idle-v1.png$/,
    );
    await expect(obs.locator(".pulseIcon")).toHaveAttribute(
      "data-popcat-frame",
      "idle",
    );
    await obs.screenshot({
      path: testInfo.outputPath("totem-idle.png"),
      omitBackground: true,
    });
    await obs.emulateMedia({ reducedMotion: "reduce" });
    expect(
      await image.evaluate((node) => getComputedStyle(node).animationName),
    ).toBe("none");
  } finally {
    await recording.close();
  }

  await page.request.post("/api/session", {
    headers: { Authorization: `Bearer ${"a".repeat(40)}` },
  });
  await page.goto("/");
  await page.getByRole("tab", { name: "Natanael", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Probar Natanael" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Probar Natanael" }).click();
  await expect(page.locator(".totemBurst")).toBeVisible();
  await expect(page.locator(".pulseIcon")).toHaveAttribute(
    "data-totem-pops",
    "1",
  );
});
