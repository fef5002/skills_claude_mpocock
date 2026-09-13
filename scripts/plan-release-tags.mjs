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

      if (entry.isSymbolicLink()) {
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
  const currentManifest = JSON.parse(readFileSync(path.join(root, packageJsonPath), "utf8"));

  if (currentManifest.version !== packageVersion) {
    throw new Error(
      `Expected ${packageJsonPath} to currently contain version ${packageVersion}`,
    );
  }

  const commits = runGit(["log", "--format=%H", "--", packageJsonPath], root)
    .stdout
    .trim()
    .split("\n")
    .filter(Boolean);
  let releaseCommit = "";

  for (const commit of commits) {
    const manifestAtCommit = JSON.parse(
      runGit(["show", `${commit}:${packageJsonPath}`], root).stdout,
    );

    if (manifestAtCommit.version === packageVersion) {
      releaseCommit = commit;
      continue;
    }

    if (releaseCommit) {
      break;
    }
  }

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

    if (remoteTag.status !== 2) {
      throw new Error(
        remoteTag.stderr.trim() ||
          remoteTag.stdout.trim() ||
          `git ls-remote failed for refs/tags/${pkg.tag}`,
      );
    }

    return [
      {
        ...pkg,
        releaseCommit: findReleaseCommit(pkg.packageJsonPath, pkg.version, root),
      },
    ];
  });
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
