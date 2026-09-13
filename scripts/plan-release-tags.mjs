import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import semver from "semver";

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
  const currentVersion = semver.valid(currentManifest.version, { loose: true });
  const targetVersion = semver.valid(packageVersion, { loose: true });

  if (!currentVersion || !targetVersion || !semver.eq(currentVersion, targetVersion)) {
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
  const remoteTagsResult = runGit(["ls-remote", "--tags", remote], root, {
    allowFailure: true,
  });

  if (remoteTagsResult.status !== 0) {
    throw new Error(
      remoteTagsResult.stderr.trim() ||
        remoteTagsResult.stdout.trim() ||
        `git ls-remote failed for ${remote}`,
    );
  }

  const existingRemoteTags = new Set(
    remoteTagsResult.stdout
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => line.split("\t")[1]?.replace(/^refs\/tags\//, ""))
      .map((tag) => tag?.replace(/\^\{\}$/, ""))
      .filter(Boolean),
  );

  return collectReleasePackages(root).flatMap((pkg) => {
    if (existingRemoteTags.has(pkg.tag)) {
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
