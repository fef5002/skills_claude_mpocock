import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import semver from "semver";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function syncPluginVersion(root = path.resolve(__dirname, "..")) {
  const packageJsonPath = path.join(root, "package.json");
  const pluginJsonPath = path.join(root, ".claude-plugin", "plugin.json");
  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
  const pluginJson = JSON.parse(await readFile(pluginJsonPath, "utf8"));
  const packageVersion = parseVersion(packageJson.version);
  const pluginVersion = parseVersion(pluginJson.version);

  if (semver.compare(packageVersion, pluginVersion) < 0) {
    throw new Error(
      `Refusing to move .claude-plugin/plugin.json backwards from ${pluginJson.version} to ${packageJson.version}`,
    );
  }

  if (pluginJson.version !== packageJson.version) {
    pluginJson.version = packageJson.version;
    await writeFile(pluginJsonPath, `${JSON.stringify(pluginJson, null, 2)}\n`);
  }
}

function parseVersion(version) {
  const parsedVersion = semver.valid(version);

  if (!parsedVersion) {
    throw new Error(`Unsupported semver version: ${version}`);
  }

  return parsedVersion;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await syncPluginVersion();
}
