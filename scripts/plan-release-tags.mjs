import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function collectReleasePackages(root = path.resolve(__dirname, "..")) {
  const ignoredDirectories = new Set([".git", ".changeset", "node_modules"]);
  const packages = [];

  function walk(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (ignoredDirectories.has(entry.name)) {
        continue;
      }

      const entryPath = path.join(directory, entry.name);

      if (entry.isDirectory()) {
        walk(entryPath);
        continue;
      }

      if (entry.name !== "package.json") {
        continue;
      }

      const pkg = JSON.parse(readFileSync(entryPath, "utf8"));

      if (pkg.name && pkg.version) {
        packages.push({
          tag: `${pkg.name}@${pkg.version}`,
          packageJsonPath: path.relative(root, entryPath),
          version: pkg.version,
        });
      }
    }
  }

  walk(root);

  return packages;
}

export function findReleaseCommit(
  packageJsonPath,
  packageVersion,
  root = path.resolve(__dirname, ".."),
) {
  const packageJson = readFileSync(path.join(root, packageJsonPath), "utf8");
  const versionLinePattern = new RegExp(
    `^\\s*"version":\\s*"${escapeRegExp(packageVersion)}"\\s*,?\\s*$`,
  );
  const versionLine = packageJson.split("\n").findIndex((line) => versionLinePattern.test(line));

  if (versionLine === -1) {
    throw new Error(
      `Could not find version ${packageVersion} in ${packageJsonPath}`,
    );
  }

  const result = runGit(
    ["blame", "--porcelain", "-L", `${versionLine + 1},${versionLine + 1}`, "--", packageJsonPath],
    root,
  );
  const releaseCommit = result.stdout.split("\n")[0].trim().split(" ")[0];

  if (!releaseCommit) {
    throw new Error(
      `Could not determine the release commit for ${packageJsonPath} at version ${packageVersion}`,
    );
  }

  return releaseCommit;
}

export function listMissingReleaseTags(
  root = path.resolve(__dirname, ".."),
  remote = "origin",
) {
  return collectReleasePackages(root).flatMap((pkg) => {
    const remoteTag = runGit(
      ["ls-remote", "--exit-code", "--tags", remote, `refs/tags/${pkg.tag}`],
      root,
      { allowFailure: true },
    );

    if (remoteTag.status === 0) {
      return [];
    }

    return [
      {
        ...pkg,
        releaseCommit: findReleaseCommit(pkg.packageJsonPath, pkg.version, root),
      },
    ];
  });
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function runGit(args, cwd, { allowFailure = false } = {}) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
  });

  if (!allowFailure && result.status !== 0) {
    throw new Error(result.stderr.trim() || result.stdout.trim() || `git ${args.join(" ")} failed`);
  }

  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  for (const tag of listMissingReleaseTags()) {
    console.log(`${tag.tag}\t${tag.releaseCommit}`);
  }
}
