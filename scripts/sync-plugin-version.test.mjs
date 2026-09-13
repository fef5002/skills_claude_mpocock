import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { syncPluginVersion } from "./sync-plugin-version.mjs";

async function createFixture({ packageVersion, pluginVersion }) {
  const root = await mkdtemp(path.join(os.tmpdir(), "sync-plugin-version-"));
  await mkdir(path.join(root, ".claude-plugin"), { recursive: true });
  await writeFile(path.join(root, "package.json"), JSON.stringify({ version: packageVersion }));
  await writeFile(
    path.join(root, ".claude-plugin", "plugin.json"),
    JSON.stringify({ version: pluginVersion, name: "demo" }),
  );

  return root;
}

test("syncs a normal version upgrade into plugin.json", async () => {
  const root = await createFixture({
    packageVersion: "1.2.0",
    pluginVersion: "1.1.0",
  });

  await syncPluginVersion(root);

  const pluginJson = JSON.parse(
    await readFile(path.join(root, ".claude-plugin", "plugin.json"), "utf8"),
  );

  assert.equal(pluginJson.version, "1.2.0");
});

test("syncs prerelease versions using semver ordering", async () => {
  const root = await createFixture({
    packageVersion: "1.2.3-beta.2",
    pluginVersion: "1.2.3-beta.1",
  });

  await syncPluginVersion(root);

  const pluginJson = JSON.parse(
    await readFile(path.join(root, ".claude-plugin", "plugin.json"), "utf8"),
  );

  assert.equal(pluginJson.version, "1.2.3-beta.2");
});

test("refuses to move plugin.json backwards", async () => {
  const root = await createFixture({
    packageVersion: "1.2.3-beta.1",
    pluginVersion: "1.2.3",
  });

  await assert.rejects(
    syncPluginVersion(root),
    /Refusing to move \.claude-plugin\/plugin\.json backwards/,
  );
});
