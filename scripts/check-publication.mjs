import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
let temporary;
try {
  // An external temporary index checks the actual tree without initializing this project.
  let gitArgs = ["-C", root];
  if (!existsSync(join(root, ".git"))) {
    temporary = mkdtempSync(join(tmpdir(), "pulse-publication-"));
    const init = spawnSync("git", ["init", "--quiet", temporary], {
      encoding: "utf8",
    });
    if (init.status !== 0)
      throw new Error("Se necesita Git para verificar las exclusiones.");
    gitArgs = [`--git-dir=${join(temporary, ".git")}`, `--work-tree=${root}`];
  }
  function git(args, input) {
    const result = spawnSync("git", [...gitArgs, ...args], {
      cwd: root,
      input,
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
    });
    if (![0, 1].includes(result.status))
      throw new Error("Git no pudo inspeccionar los archivos.");
    return result.stdout.split("\0").filter(Boolean);
  }
  const privateExamples = [
    ".env",
    ".env.production",
    "deploy/.env.backup",
    "production.env",
    "secrets/token.txt",
    "server.key",
    "backup.pfx",
    "node_modules/example/index.js",
    "dist/index.html",
    "dist-server/server/index.js",
    "data/design.json",
    "backups/data.tar.gz",
    "test-results/screen.png",
    "docs/assets/reference.png",
    ".tooling/sdk/bin/tool",
    "export.sql",
    "signing.jks",
    "app.apk",
  ];
  const ignored = new Set(
    git(
      ["check-ignore", "--no-index", "--stdin", "-z"],
      privateExamples.join("\0") + "\0",
    ),
  );
  if (privateExamples.some((path) => !ignored.has(path)))
    throw new Error("Hay rutas privadas sin cubrir en .gitignore.");
  const files = git([
    "ls-files",
    "--cached",
    "--others",
    "--exclude-standard",
    "-z",
  ]);
  const templates = new Set([".env.example", ".env.production.example"]);
  const ignoredButIncluded = new Set(
    git(
      ["check-ignore", "--no-index", "--stdin", "-z"],
      files.join("\0") + "\0",
    ),
  );
  const forbidden = files.filter(
    (path) =>
      !templates.has(path) &&
      (ignoredButIncluded.has(path) ||
        /(^|\/)(\.env(?:\..*)?|node_modules|dist|dist-server|data|backups|\.tooling|\.ssh|\.idea|test-results|playwright-report)(\/|$)/.test(
          path,
        ) ||
        /\.(?:env|pem|key|p12|pfx|jks|keystore|apk|aab|log|sql|sqlite3?|dump|zip|7z|bak)$/i.test(
          path,
        )),
  );
  if (forbidden.length)
    throw new Error(
      `Hay ${forbidden.length} archivos privados o generados ya incluidos. .gitignore no retira archivos previamente versionados.`,
    );
  for (const required of [
    ".gitignore",
    ".env.example",
    ".env.production.example",
    "package-lock.json",
    "Dockerfile",
    "compose.yaml",
    "deploy/nginx-site.conf.example",
    "docs/deployment.md",
    "src/ui/App.tsx",
    "public/assets/hearts/phases/natanael-totem-idle-v1.png",
    "public/assets/fonts/VT323-Regular.ttf",
  ]) {
    if (!files.includes(required))
      throw new Error(`Falta un archivo publicable necesario: ${required}`);
  }
  const secrets = [".env", ".env.production"].flatMap((name) => {
    if (!existsSync(join(root, name))) return [];
    const env = parseEnv(readFileSync(join(root, name), "utf8"));
    return [env.ADMIN_TOKEN, env.INGEST_TOKEN, env.OVERLAY_TOKEN].filter(
      (value) => value?.length >= 32,
    );
  });
  for (const file of files.filter((path) =>
    /\.(?:m?[jt]sx?|json|md|html|css|ya?ml|example|sh|ps1)$/.test(path),
  )) {
    const content = readFileSync(join(root, file), "utf8");
    if (secrets.some((secret) => content.includes(secret)))
      throw new Error(
        "Se encontro una credencial local en un archivo publicable. No se muestra su valor.",
      );
  }
  console.log(
    `Exclusiones verificadas: ${privateExamples.length} rutas privadas; ${files.length} archivos candidatos.`,
  );
  console.log(
    "Credenciales locales no detectadas en los archivos de texto candidatos. No sustituye una revision del historial Git ni un analizador completo de secretos.",
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  if (temporary) {
    const boundary = realpathSync(tmpdir()) + sep;
    if (!realpathSync(temporary).startsWith(boundary))
      throw new Error("No se eliminara un directorio fuera del temporal.");
    rmSync(temporary, { recursive: true, force: true });
  }
}
