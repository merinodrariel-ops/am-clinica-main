import { cp, lstat, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";

const repositoryRoot = process.cwd();
const temporaryRoot = await mkdtemp(join(tmpdir(), "am-clinica-gitleaks-"));

try {
  const trackedFiles = spawnSync("git", ["ls-files", "-z"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  });

  if (trackedFiles.status !== 0) {
    process.stderr.write(trackedFiles.stderr || "Unable to enumerate tracked files.\n");
    process.exit(trackedFiles.status ?? 1);
  }

  for (const relativePath of trackedFiles.stdout.split("\0").filter(Boolean)) {
    const sourcePath = join(repositoryRoot, relativePath);
    const destinationPath = join(temporaryRoot, relativePath);

    try {
      const sourceStats = await lstat(sourcePath);
      if (!sourceStats.isFile() && !sourceStats.isSymbolicLink()) continue;

      await mkdir(dirname(destinationPath), { recursive: true });
      await cp(sourcePath, destinationPath, { dereference: false });
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }

  const scan = spawnSync(
    "gitleaks",
    ["dir", temporaryRoot, "--redact", "--no-banner"],
    { cwd: repositoryRoot, stdio: "inherit" },
  );

  process.exitCode = scan.status ?? 1;
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
