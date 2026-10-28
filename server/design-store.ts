import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { defaultDesign, designSchema, type OverlayDesign } from "../shared/domain.js";

export async function createDesignStore(directory: string) {
  await mkdir(directory, { recursive: true });
  const filename = join(directory, "design.json");
  let design: OverlayDesign;
  try {
    design = designSchema.parse(JSON.parse(await readFile(filename, "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw new Error("No se pudo leer data/design.json. Revisa el archivo antes de iniciar.");
    design = structuredClone(defaultDesign);
    await writeFile(filename, JSON.stringify(design, null, 2), { flag: "wx", mode: 0o600 });
  }
  let pending = Promise.resolve();
  return {
    get: () => design,
    save(next: OverlayDesign) {
      const operation = pending.then(async () => {
        const temporary = `${filename}.tmp`;
        await writeFile(temporary, JSON.stringify(next, null, 2), { mode: 0o600 });
        await rename(temporary, filename);
        design = next;
      });
      pending = operation.catch(() => {});
      return operation;
    },
    flush: () => pending,
  };
}
