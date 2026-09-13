import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { collectReleasePackages, findReleaseCommit } from "./plan-release-tags.mjs";

async function createRepoFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "plan-release-tags-"));
  await mkdir(path.join(root, ".claude-plugin"), { recursive: true });
  runGit(["init"], root);
  runGit(["config", "user.name", "Test User"], root);
  runGit(["config", "user.email", "test@example.com"], root);

  await writeFile(
    path.join(root, "package.json"),
    JSON.stringify({ name: "demo-pkg", version: "1.0.0" }, null, 2) + "\n",
  );
  runGit(["add", "package.json"], root);
  runGit(["commit", "-m", "initial version"], root);
  const initialCommit = runGit(["rev-parse", "HEAD"], root).stdout.trim();

  await writeFile(
    path.join(root, "package.json"),
    JSON.stringify({ name: "demo-pkg", version: "1.1.0" }, null, 2) + "\n",
  );
  runGit(["add", "package.json"], root);
  runGit(["commit", "-m", "release 1.1.0"], root);
  const releaseCommit = runGit(["rev-parse", "HEAD"], root).stdout.trim();

  return { root, initialCommit, releaseCommit };
}

test("collectReleasePackages finds package manifests and tags", async () => {
  const { root } = await createRepoFixture();

  assert.deepEqual(collectReleasePackages(root), [
    {
      tag: "demo-pkg@1.1.0",
      packageJsonPath: "package.json",
      version: "1.1.0",
    },
  ]);
});

test("collectReleasePackages includes nested manifests and ignores skipped directories", async () => {
  const { root } = await createRepoFixture();
  await mkdir(path.join(root, "packages", "nested"), { recursive: true });
  await mkdir(path.join(root, "node_modules", "ignored"), { recursive: true });
  await mkdir(path.join(root, ".changeset", "ignored"), { recursive: true });
  await writeFile(
    path.join(root, "packages", "nested", "package.json"),
    JSON.stringify({ name: "nested-pkg", version: "2.0.0" }, null, 2) + "\n",
  );
  await writeFile(
    path.join(root, "node_modules", "ignored", "package.json"),
    JSON.stringify({ name: "ignored-node-modules", version: "9.9.9" }, null, 2) + "\n",
  );
  await writeFile(
    path.join(root, ".changeset", "ignored", "package.json"),
    JSON.stringify({ name: "ignored-changeset", version: "9.9.9" }, null, 2) + "\n",
  );

  assert.deepEqual(collectReleasePackages(root), [
    {
      tag: "demo-pkg@1.1.0",
      packageJsonPath: "package.json",
      version: "1.1.0",
    },
    {
      tag: "nested-pkg@2.0.0",
      packageJsonPath: "packages/nested/package.json",
      version: "2.0.0",
    },
  ]);
});

test("findReleaseCommit returns the commit that introduced the current version", async () => {
  const { root, initialCommit, releaseCommit } = await createRepoFixture();

  assert.notEqual(initialCommit, releaseCommit);
  assert.equal(findReleaseCommit("package.json", "1.1.0", root), releaseCommit);
});

function runGit(args, cwd) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
  });

  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || result.stdout.trim() || `git ${args.join(" ")} failed`);
  }

  return result;
}
