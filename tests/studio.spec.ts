import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { defaultDesign } from "../shared/domain";
import { themes } from "../shared/themes";

test.beforeEach(async ({ page }) => {
  await page.request.post("/api/session", {
    headers: { Authorization: `Bearer ${"a".repeat(40)}` },
  });
  await page.request.put("/api/design", { data: defaultDesign });
  await page.goto("/");
  await expect(
    page.getByRole("radio", { name: "Minecraft", exact: true }),
  ).toBeEnabled();
});

test("appearance persists independently of the overlay and every workspace fits mobile", async ({
  page,
  browser,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.getByRole("button", { name: "Calma 70" }).click();
  for (const appearance of ["oscuro", "claro"]) {
    await page
      .getByRole("button", { name: `Tema ${appearance}`, exact: true })
      .click();
    await expect(page.locator(".studioShell")).toHaveAttribute(
      "data-appearance",
      appearance === "claro" ? "light" : "dark",
    );
    await expect(
      page.getByRole("button", { name: "Guardar diseno" }),
    ).toBeDisabled();
    await page.screenshot({
      path: testInfo.outputPath(`studio-${appearance}-desktop.png`),
      fullPage: true,
      animations: "disabled",
    });
    for (const width of [900, 375, 320]) {
      await page.setViewportSize({ width, height: 900 });
      for (const view of ["Biblioteca", "Conexiones", "Estudio"]) {
        await page
          .getByRole("navigation")
          .getByRole("button", { name: view, exact: true })
          .click();
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth),
        ).toBeLessThanOrEqual(width);
      }
    }
    await page.screenshot({
      path: testInfo.outputPath(`studio-${appearance}-mobile.png`),
      fullPage: true,
      animations: "disabled",
    });
    await page.setViewportSize({ width: 1440, height: 1050 });
  }
  await page.reload();
  await expect(page.locator(".studioShell")).toHaveAttribute(
    "data-appearance",
    "light",
  );
  await expect(
    page.getByRole("button", { name: "Guardar diseno" }),
  ).toBeDisabled();
  const obsContext = await browser.newContext();
  try {
    const obs = await obsContext.newPage();
    await obs.goto(`/overlay?token=${"o".repeat(40)}`);
    await expect(obs.locator(".overlayRoot")).toHaveClass(/minecraft/);
    expect(
      await obs.evaluate(() => getComputedStyle(document.body).backgroundColor),
    ).toBe("rgba(0, 0, 0, 0)");
    expect(await obs.locator(".studioShell").count()).toBe(0);
  } finally {
    await obsContext.close();
  }
  expect(errors).toEqual([]);
});

test("undo, redo, local library and validated JSON import/export form a complete editing workflow", async ({
  page,
}, testInfo) => {
  await page
    .getByRole("radio", { name: themes.neon.label, exact: true })
    .check();
  await page.getByRole("button", { name: "Deshacer", exact: true }).click();
  await expect(
    page.getByRole("radio", { name: "Minecraft", exact: true }),
  ).toBeChecked();
  await page.getByRole("button", { name: "Rehacer", exact: true }).click();
  await expect(
    page.getByRole("radio", { name: themes.neon.label, exact: true }),
  ).toBeChecked();
  await page
    .getByLabel("Nombre del overlay", { exact: true })
    .fill("Mi overlay");
  await page
    .getByRole("button", { name: "Guardar en biblioteca", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Guardar en biblioteca", exact: true })
    .click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Biblioteca", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Mi overlay", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Mi overlay", exact: true }),
  ).toHaveCount(1);
  await page.screenshot({
    path: testInfo.outputPath("library.png"),
    fullPage: true,
  });
  const savedTile = page.locator(".libraryItem").filter({
    has: page.getByRole("heading", { name: "Mi overlay", exact: true }),
  });
  const downloadEvent = page.waitForEvent("download");
  await savedTile.getByRole("button", { name: "Exportar Mi overlay" }).click();
  const file = await downloadEvent;
  const exported = JSON.parse(await readFile((await file.path())!, "utf8"));
  expect(exported.name).toBe("Mi overlay");
  expect(exported.theme).toBe("neon");
  await savedTile.getByRole("button", { name: "Usar en el estudio" }).click();
  await expect(
    page.getByLabel("Nombre del overlay", { exact: true }),
  ).toHaveValue("Mi overlay");
  await page.getByLabel("Archivo de overlay").setInputFiles({
    name: "overlay.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({ ...defaultDesign, name: "Importado" }),
    ),
  });
  await expect(
    page.getByLabel("Nombre del overlay", { exact: true }),
  ).toHaveValue("Importado");
  await page
    .getByRole("button", { name: "Guardar diseno", exact: true })
    .click();
  await expect(page.getByRole("status", { name: "Avisos" })).toContainText(
    "Diseno guardado.",
  );
  await page.getByLabel("Archivo de overlay").setInputFiles({
    name: "bad.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"bad":true}'),
  });
  await expect(page.getByRole("status", { name: "Avisos" })).not.toContainText(
    "Diseno guardado.",
  );
  await expect(
    page.getByLabel("Nombre del overlay", { exact: true }),
  ).toHaveValue("Importado");
  await page.reload();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Biblioteca", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Mi overlay", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Eliminar Mi overlay", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Mi overlay", exact: true }),
  ).toHaveCount(0);
});

test("range editing validates before save, scenarios select exact BPM and connection status is real", async ({
  page,
}, testInfo) => {
  await page.getByRole("tab", { name: "Rangos", exact: true }).click();
  const initial = await page.locator(".rangeItem").count();
  await page
    .getByRole("button", { name: "Agregar rango", exact: true })
    .click();
  await expect(page.locator(".rangeItem")).toHaveCount(initial + 1);
  await expect(
    page.getByRole("button", { name: "Guardar diseno", exact: true }),
  ).toBeEnabled();
  const added = page
    .locator(".rangeItem")
    .filter({ has: page.locator(".rangeFields") });
  await added.getByLabel(/minimo/).fill("260");
  await expect(
    page.getByRole("button", { name: "Guardar diseno", exact: true }),
  ).toBeDisabled();
  await expect(page.locator(".inlineError")).toBeVisible();
  await page.getByRole("button", { name: "Deshacer", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Guardar diseno", exact: true }),
  ).toBeEnabled();
  await added.getByRole("button", { name: /^Eliminar / }).click();
  await expect(page.locator(".rangeItem")).toHaveCount(initial);
  await page.getByRole("button", { name: "Acelerado 120" }).click();
  await expect(page.locator(".bpmNumber")).toHaveText("120");
  await expect(page.getByLabel("Automatico")).not.toBeChecked();
  await page.getByRole("button", { name: "Fondo claro", exact: true }).click();
  await expect(page.locator(".previewStage")).toHaveAttribute(
    "data-background",
    "light",
  );
  await page
    .getByRole("button", { name: "Ampliar lienzo", exact: true })
    .click();
  await expect(page.locator(".studioPreview")).toHaveClass(/expanded/);
  await page
    .getByRole("button", { name: "Reducir lienzo", exact: true })
    .click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Conexiones", exact: true })
    .click();
  await expect(
    page.getByText("Servidor disponible", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".serverCheck b")).toContainText("ms");
  await expect(page.getByLabel("URL para OBS")).toHaveAttribute(
    "type",
    "password",
  );
  await page
    .getByRole("button", { name: "Mostrar enlace", exact: true })
    .click();
  await expect(page.getByLabel("URL para OBS")).toHaveAttribute("type", "text");
  await expect(page.getByLabel("Destino de la app")).toHaveValue(
    /\/api\/pulse$/,
  );
  await page.screenshot({
    path: testInfo.outputPath("connections.png"),
    fullPage: true,
  });
});

test("unsaved work survives remote updates and logout requires confirmation", async ({
  page,
}) => {
  await page
    .getByLabel("Nombre del overlay", { exact: true })
    .fill("Sin publicar");
  await page.request.put("/api/design", {
    data: { ...defaultDesign, name: "Remoto" },
  });
  await expect(
    page.getByLabel("Nombre del overlay", { exact: true }),
  ).toHaveValue("Sin publicar");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page
    .getByRole("button", { name: "Cerrar sesion", exact: true })
    .click();
  await expect(
    page.getByLabel("Nombre del overlay", { exact: true }),
  ).toHaveValue("Sin publicar");
  await page
    .getByRole("button", { name: "Descartar cambios", exact: true })
    .click();
  await expect(
    page.getByLabel("Nombre del overlay", { exact: true }),
  ).toHaveValue("Remoto");
  await expect(
    page.getByRole("button", { name: "Guardar diseno", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Cerrar sesion", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Entrar", exact: true }),
  ).toBeVisible();
});
