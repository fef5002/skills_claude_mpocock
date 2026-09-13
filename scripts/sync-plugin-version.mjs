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
  const leftVersion = parseVersion(left);
  const rightVersion = parseVersion(right);

  for (let index = 0; index < leftVersion.core.length; index += 1) {
    const difference = leftVersion.core[index] - rightVersion.core[index];

    if (difference !== 0) {
      return difference;
    }
  }

  if (leftVersion.prerelease.length === 0 && rightVersion.prerelease.length === 0) {
    return 0;
  }

  if (leftVersion.prerelease.length === 0) {
    return 1;
  }

  if (rightVersion.prerelease.length === 0) {
    return -1;
  }

  const prereleaseLength = Math.max(
    leftVersion.prerelease.length,
    rightVersion.prerelease.length,
  );

  for (let index = 0; index < prereleaseLength; index += 1) {
    const leftPart = leftVersion.prerelease[index];
    const rightPart = rightVersion.prerelease[index];

    if (leftPart === undefined) {
      return -1;
    }

    if (rightPart === undefined) {
      return 1;
    }

    const leftNumber = Number(leftPart);
    const rightNumber = Number(rightPart);
    const leftIsNumber = String(leftNumber) === leftPart;
    const rightIsNumber = String(rightNumber) === rightPart;

    if (leftIsNumber && rightIsNumber) {
      const difference = leftNumber - rightNumber;

      if (difference !== 0) {
        return difference;
      }

      continue;
    }

    if (leftIsNumber) {
      return -1;
    }

    if (rightIsNumber) {
      return 1;
    }

    const difference = leftPart.localeCompare(rightPart);

    if (difference !== 0) {
      return difference;
    }
  }

  return 0;
}

function parseVersion(version) {
  const match = version.match(
    /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/,
  );

  if (!match) {
    throw new Error(`Unsupported semver version: ${version}`);
  }

  return {
    core: match.slice(1, 4).map(Number),
    prerelease: match[4] ? match[4].split(".") : [],
  };
}
