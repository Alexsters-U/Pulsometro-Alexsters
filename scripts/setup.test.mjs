import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { parseEnv } from "node:util";

const setup = fileURLToPath(new URL("./setup.mjs", import.meta.url));
const preflight = fileURLToPath(new URL("./check-deploy.mjs", import.meta.url));
test("production setup separates local credentials and never overwrites existing configuration", () => {
  const folder = mkdtempSync(join(tmpdir(), "pulse-setup-"));
  try {
    function run(args) {
      return spawnSync(process.execPath, [setup, ...args], {
        cwd: folder,
        encoding: "utf8",
      });
    }
    assert.equal(run([]).status, 0);
    const local = readFileSync(join(folder, ".env"), "utf8");
    const result = run([
      "--production",
      "--origin",
      "https://pulse.example.com",
    ]);
    assert.equal(result.status, 0);
    const production = readFileSync(join(folder, ".env.production"), "utf8");
    const values = parseEnv(production);
    assert.equal(values.NODE_ENV, "production");
    assert.equal(values.PUBLIC_ORIGIN, "https://pulse.example.com");
    assert.equal(values.APP_PORT, "3010");
    assert.equal(
      new Set([values.ADMIN_TOKEN, values.INGEST_TOKEN, values.OVERLAY_TOKEN])
        .size,
      3,
    );
    assert.notEqual(values.ADMIN_TOKEN, parseEnv(local).ADMIN_TOKEN);
    assert.ok(!result.stdout.includes(values.ADMIN_TOKEN));
    const checked = spawnSync(
      process.execPath,
      [preflight, "--env", join(folder, ".env.production")],
      { cwd: folder, encoding: "utf8" },
    );
    assert.equal(checked.status, 0, checked.stderr);
    assert.ok(!checked.stdout.includes(values.ADMIN_TOKEN));
    assert.notEqual(
      spawnSync(process.execPath, [preflight, "--env", join(folder, ".env")], {
        cwd: folder,
        encoding: "utf8",
      }).status,
      0,
    );
    assert.equal(run(["--production"]).status, 0);
    assert.equal(
      readFileSync(join(folder, ".env.production"), "utf8"),
      production,
    );
    assert.equal(readFileSync(join(folder, ".env"), "utf8"), local);
    assert.notEqual(
      run(["--production", "--origin", "http://pulse.example.com"]).status,
      0,
    );
    assert.notEqual(
      run(["--production", "--origin", "https://pulse.example.com/private"])
        .status,
      0,
    );
  } finally {
    assert.ok(realpathSync(folder).startsWith(realpathSync(tmpdir()) + sep));
    rmSync(folder, { recursive: true, force: true });
  }
});
