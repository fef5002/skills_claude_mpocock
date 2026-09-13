import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const packageJsonPath = path.join(root, "package.json");
const pluginJsonPath = path.join(root, ".claude-plugin", "plugin.json");

const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
const pluginJson = JSON.parse(await readFile(pluginJsonPath, "utf8"));

if (compareVersions(packageJson.version, pluginJson.version) < 0) {
  throw new Error(
    `Refusing to move .claude-plugin/plugin.json backwards from ${pluginJson.version} to ${packageJson.version}`,
  );
}

if (pluginJson.version !== packageJson.version) {
  pluginJson.version = packageJson.version;
  await writeFile(pluginJsonPath, `${JSON.stringify(pluginJson, null, 2)}\n`);
}

function compareVersions(left, right) {
  const leftParts = left.split(".").map(Number);
  const rightParts = right.split(".").map(Number);
  const length = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < length; index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);

    if (difference !== 0) {
      return difference;
    }
  }

  return 0;
}
