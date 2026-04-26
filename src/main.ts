// SPDX-FileCopyrightText: Copyright 2026 Puneet Matharu
//
// SPDX-License-Identifier: MIT OR Apache-2.0

import * as core from "@actions/core";
import * as exec from "@actions/exec";
import * as httpm from "@actions/http-client";
import * as tc from "@actions/tool-cache";
import * as crypto from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const TOOL_NAME = "cmakefmt";
const REPO = "cmakefmt/cmakefmt";

type Mode = "" | "check" | "diff" | "fix" | "setup";
type Scope = "all" | "changed" | "staged";

interface BuildArgsOptions {
  args: string;
  checkOnly: boolean;
  diff: boolean;
  reportFormat: string;
  mode: string;
  scope: string;
  paths: string;
  since: string;
}

interface RunSummary {
  selected?: number;
  changed?: number;
  unchanged?: number;
  skipped?: number;
  failed?: number;
  total_changed_lines?: number;
}

interface JsonReport {
  summary?: RunSummary;
}

interface GitHubPushEvent {
  before?: string;
}

// ---------------------------------------------------------------------------
// Platform / architecture mapping
// ---------------------------------------------------------------------------

interface Target {
  triple: string;
  ext: string;
}

export function getTarget(): Target {
  const platform = os.platform();
  const arch = os.arch();

  const targets: Record<string, Record<string, Target>> = {
    linux: {
      x64: { triple: "x86_64-unknown-linux-musl", ext: "tar.gz" },
      arm64: { triple: "aarch64-unknown-linux-gnu", ext: "tar.gz" },
    },
    darwin: {
      x64: { triple: "x86_64-apple-darwin", ext: "tar.gz" },
      arm64: { triple: "aarch64-apple-darwin", ext: "tar.gz" },
    },
    win32: {
      x64: { triple: "x86_64-pc-windows-msvc", ext: "zip" },
    },
  };

  const target = targets[platform]?.[arch];
  if (!target) {
    throw new Error(
      `Unsupported platform/architecture: ${platform}/${arch}`,
    );
  }
  return target;
}

// ---------------------------------------------------------------------------
// Version resolution
// ---------------------------------------------------------------------------

export async function resolveVersion(
  input: string,
  token: string,
): Promise<string> {
  if (input !== "latest") {
    return input.replace(/^v/, "");
  }

  const client = new httpm.HttpClient("cmakefmt-action");
  const response = await client.getJson<{ tag_name: string }>(
    `https://api.github.com/repos/${REPO}/releases/latest`,
    {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
    },
  );

  const tag = response.result?.tag_name;
  if (!tag) {
    throw new Error(
      "Failed to resolve latest cmakefmt version from GitHub API",
    );
  }
  return tag.replace(/^v/, "");
}

// ---------------------------------------------------------------------------
// Checksum verification
// ---------------------------------------------------------------------------

export function computeSha256(filePath: string): string {
  const data = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(data).digest("hex");
}

export async function verifyChecksum(
  archivePath: string,
  baseUrl: string,
  archiveName: string,
): Promise<void> {
  core.info("Verifying SHA-256 checksum");
  const checksumFile = await tc.downloadTool(`${baseUrl}/SHA256SUMS`);
  const content = fs.readFileSync(checksumFile, "utf8");

  let expected = "";
  for (const line of content.split(/\r?\n/)) {
    const parts = line.trim().split(/\s+/);
    if (parts.length >= 2 && parts[1] === archiveName) {
      expected = parts[0];
      break;
    }
  }

  if (!expected) {
    throw new Error(`${archiveName} not found in SHA256SUMS`);
  }

  const actual = computeSha256(archivePath);
  if (actual !== expected) {
    throw new Error(
      `Checksum mismatch for ${archiveName} ` +
        `(expected=${expected} actual=${actual})`,
    );
  }
}

// ---------------------------------------------------------------------------
// Install
// ---------------------------------------------------------------------------

export async function install(version: string): Promise<string> {
  const cached = tc.find(TOOL_NAME, version);
  if (cached) {
    core.info(`Found cached ${TOOL_NAME} ${version}`);
    return cached;
  }

  const { triple, ext } = getTarget();
  const archive = `${TOOL_NAME}-${version}-${triple}.${ext}`;
  const baseUrl = `https://github.com/${REPO}/releases/download/v${version}`;
  const archiveUrl = `${baseUrl}/${archive}`;

  core.info(`Downloading ${archiveUrl}`);
  const downloaded = await tc.downloadTool(archiveUrl);

  await verifyChecksum(downloaded, baseUrl, archive);

  let extractDir: string;
  if (ext === "zip") {
    extractDir = await tc.extractZip(downloaded);
  } else {
    extractDir = await tc.extractTar(downloaded);
  }

  const binDir = path.join(extractDir, `${TOOL_NAME}-${version}-${triple}`);
  return tc.cacheDir(binDir, TOOL_NAME, version);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

function normalizeMode(mode: string): Mode {
  const normalized = mode.trim().toLowerCase();
  if (
    normalized === "" ||
    normalized === "check" ||
    normalized === "diff" ||
    normalized === "fix" ||
    normalized === "setup"
  ) {
    return normalized;
  }
  throw new Error(
    `Invalid mode "${mode}". Supported values: check, diff, fix, setup.`,
  );
}

function normalizeScope(scope: string): Scope {
  const normalized = scope.trim().toLowerCase();
  if (normalized === "" || normalized === "all") return "all";
  if (normalized === "changed" || normalized === "staged") {
    return normalized;
  }
  throw new Error(
    `Invalid scope "${scope}". Supported values: all, changed, staged.`,
  );
}

export function parseArgs(input: string): string[] {
  const args: string[] = [];
  let current = "";
  let quote: "'" | '"' | "" = "";
  let escaping = false;

  for (const char of input.trim()) {
    if (escaping) {
      current += char;
      escaping = false;
      continue;
    }

    if (char === "\\" && quote !== "'") {
      escaping = true;
      continue;
    }

    if ((char === "'" || char === '"') && !quote) {
      quote = char;
      continue;
    }

    if (char === quote) {
      quote = "";
      continue;
    }

    if (/\s/.test(char) && !quote) {
      if (current) {
        args.push(current);
        current = "";
      }
      continue;
    }

    current += char;
  }

  if (escaping) current += "\\";
  if (quote) throw new Error("Unterminated quote in args input");
  if (current) args.push(current);
  return args;
}

export function parsePaths(input: string): string[] {
  return input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
}

function hasFlag(args: string[], flag: string): boolean {
  return args.some((arg) => arg === flag || arg.startsWith(`${flag}=`));
}

function hasAnyFlag(args: string[], flags: string[]): boolean {
  return flags.some((flag) => hasFlag(args, flag));
}

function unshiftFlag(args: string[], flag: string, value?: string): void {
  if (value === undefined) {
    args.unshift(flag);
  } else {
    args.unshift(flag, value);
  }
}

function defaultSince(since: string): string {
  if (since.trim()) return since.trim();
  const baseRef = process.env.GITHUB_BASE_REF;
  if (baseRef) return `origin/${baseRef}`;

  if (process.env.GITHUB_EVENT_NAME === "push") {
    const eventPath = process.env.GITHUB_EVENT_PATH;
    if (!eventPath) return "";

    try {
      const event = JSON.parse(
        fs.readFileSync(eventPath, "utf8"),
      ) as GitHubPushEvent;
      const before = event.before?.trim() ?? "";
      if (before && !/^0+$/.test(before)) return before;
    } catch {
      return "";
    }
  }

  return "";
}

export function buildArgs(options: BuildArgsOptions): string[] {
  const mode = normalizeMode(options.mode);
  const scope = normalizeScope(options.scope);
  const paths = parsePaths(options.paths);
  const legacyArgs = parseArgs(options.args);
  const hasLegacyArgs =
    legacyArgs.length > 0 &&
    !(legacyArgs.length === 1 && legacyArgs[0] === ".");

  if (mode === "setup") return [];
  if (
    mode === "" &&
    legacyArgs.length === 0 &&
    paths.length === 0 &&
    scope === "all"
  ) {
    return [];
  }

  if (paths.length > 0 && hasLegacyArgs) {
    throw new Error("The paths input cannot be combined with custom args.");
  }

  if (scope !== "all" && (paths.length > 0 || hasLegacyArgs)) {
    throw new Error(
      "The scope input cannot be combined with paths or custom args.",
    );
  }

  let argArray =
    paths.length > 0
      ? paths
      : scope === "staged"
        ? ["--staged"]
        : legacyArgs;

  if (scope === "changed") {
    const since = defaultSince(options.since);
    if (since) {
      argArray = ["--changed", "--since", since];
    } else {
      core.warning(
        "scope: changed could not infer a base ref; checking all configured paths instead.",
      );
      argArray = legacyArgs.length > 0 ? legacyArgs : ["."];
    }
  }

  const explicitAction = hasAnyFlag(argArray, [
    "--check",
    "--in-place",
    "-i",
    "--list-changed-files",
  ]);

  if (mode === "fix") {
    if (!explicitAction) {
      unshiftFlag(argArray, "--in-place");
    }
  } else {
    const wantsCheck = mode === "check" || mode === "diff" || options.checkOnly;
    if (wantsCheck && !explicitAction) {
      unshiftFlag(argArray, "--check");
    }
  }

  // Legacy API compatibility: without mode, check-only decides whether the
  // action injects --check or --in-place. Explicit cmakefmt action flags win.
  if (mode === "" && !options.checkOnly && !explicitAction) {
    unshiftFlag(argArray, "--in-place");
  }

  const wantsDiff = mode === "diff" || (mode === "" && options.diff);
  if (
    wantsDiff &&
    !hasAnyFlag(argArray, ["--in-place", "-i"]) &&
    !hasFlag(argArray, "--diff")
  ) {
    unshiftFlag(argArray, "--diff");
  }

  const writesInPlace = hasAnyFlag(argArray, ["--in-place", "-i"]);
  if (
    !writesInPlace &&
    options.reportFormat &&
    !hasFlag(argArray, "--report-format")
  ) {
    unshiftFlag(argArray, "--report-format", options.reportFormat);
  }

  return argArray;
}

function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_./:=@+-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function commandForSummary(args: string[]): string {
  return [TOOL_NAME, ...args].map(shellQuote).join(" ");
}

function getFlagValue(args: string[], flag: string): string {
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === flag) return args[i + 1] ?? "";
    if (arg.startsWith(`${flag}=`)) return arg.slice(flag.length + 1);
  }
  return "";
}

function remoteBranchFromSince(since: string): string {
  const match = /^origin\/(.+)$/.exec(since);
  return match?.[1] ?? "";
}

async function gitExit(args: string[]): Promise<number> {
  return exec.exec("git", args, {
    ignoreReturnCode: true,
    silent: true,
  });
}

async function fetchRemoteBranch(since: string): Promise<void> {
  const branch = remoteBranchFromSince(since);
  if (!branch) return;

  await gitExit([
    "fetch",
    "--no-tags",
    "--prune",
    "origin",
    `+refs/heads/${branch}:refs/remotes/origin/${branch}`,
  ]);
}

async function hasMergeBase(since: string): Promise<boolean> {
  return (await gitExit(["merge-base", since, "HEAD"])) === 0;
}

export async function prepareChangedScope(args: string[]): Promise<void> {
  if (!hasFlag(args, "--changed")) return;

  const since = getFlagValue(args, "--since");
  if (!since) return;

  await fetchRemoteBranch(since);
  if (await hasMergeBase(since)) return;

  core.info(
    "Fetching additional Git history so scope: changed can find a merge base",
  );
  const unshallow = await gitExit([
    "fetch",
    "--no-tags",
    "--prune",
    "--unshallow",
    "origin",
  ]);
  if (unshallow !== 0) {
    await gitExit(["fetch", "--no-tags", "--prune", "origin"]);
  }

  await fetchRemoteBranch(since);
}

function removeReportFormat(args: string[]): string[] {
  const filtered: string[] = [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--report-format") {
      i += 1;
      continue;
    }
    if (arg.startsWith("--report-format=")) {
      continue;
    }
    filtered.push(arg);
  }
  return filtered;
}

function localFixArgs(args: string[]): string[] {
  const filtered = removeReportFormat(args).filter(
    (arg) =>
      arg !== "--check" &&
      arg !== "--diff" &&
      arg !== "--list-changed-files",
  );
  if (!hasAnyFlag(filtered, ["--in-place", "-i"])) {
    filtered.unshift("--in-place");
  }
  return filtered;
}

function localDiffArgs(args: string[]): string[] {
  const filtered = removeReportFormat(args).filter(
    (arg) => arg !== "--check" && arg !== "--in-place" && arg !== "-i",
  );
  if (!hasFlag(filtered, "--diff")) {
    filtered.unshift("--diff");
  }
  return filtered;
}

export function parseJsonSummary(stdout: string): RunSummary | undefined {
  const trimmed = stdout.trim();
  if (!trimmed) return undefined;

  try {
    const report = JSON.parse(trimmed) as JsonReport;
    return report.summary;
  } catch {
    return undefined;
  }
}

async function writeStepSummary(
  version: string,
  args: string[],
  exitCode: number,
  jsonSummary: RunSummary | undefined,
): Promise<void> {
  const outcome = exitCode === 0 ? "passed" : "failed";
  const rows = [
    [
      { data: "Version", header: true },
      version,
    ],
    [
      { data: "Command", header: true },
      `\`${commandForSummary(args)}\``,
    ],
    [
      { data: "Outcome", header: true },
      outcome,
    ],
  ];

  if (jsonSummary) {
    rows.push(
      [
        { data: "Selected files", header: true },
        String(jsonSummary.selected ?? 0),
      ],
      [
        { data: "Files needing formatting", header: true },
        String(jsonSummary.changed ?? 0),
      ],
      [
        { data: "Failed files", header: true },
        String(jsonSummary.failed ?? 0),
      ],
    );
  }

  core.summary.addHeading("cmakefmt").addTable(rows);

  if (exitCode !== 0) {
    core.summary.addRaw("\nRun locally:\n\n");
    core.summary.addCodeBlock(commandForSummary(localFixArgs(args)), "bash");
    core.summary.addRaw("\nOr inspect the patch:\n\n");
    core.summary.addCodeBlock(commandForSummary(localDiffArgs(args)), "bash");
  }

  await core.summary.write();
}

export async function run(): Promise<void> {
  const versionInput = core.getInput("version");
  const args = core.getInput("args");
  const checkOnly = core.getInput("check-only") !== "false";
  const diff = core.getInput("diff") === "true";
  const reportFormat = core.getInput("report-format");
  const workingDirectory = core.getInput("working-directory");
  const mode = core.getInput("mode");
  const scope = core.getInput("scope");
  const paths = core.getInput("paths");
  const since = core.getInput("since");
  const token = core.getInput("token", { required: true });

  const version = await resolveVersion(versionInput, token);
  core.setOutput("version", version);
  core.info(`Resolved ${TOOL_NAME} version: ${version}`);

  const installDir = await install(version);
  core.addPath(installDir);

  const argArray = buildArgs({
    args,
    checkOnly,
    diff,
    reportFormat,
    mode,
    scope,
    paths,
    since,
  });
  if (argArray.length === 0) return;

  await prepareChangedScope(argArray);

  const options: exec.ExecOptions = {};
  let stdout = "";
  options.ignoreReturnCode = true;
  options.listeners = {
    stdout: (data: Buffer) => {
      stdout += data.toString();
    },
  };
  if (workingDirectory) {
    options.cwd = workingDirectory;
  }

  const exitCode = await exec.exec(TOOL_NAME, argArray, options);
  await writeStepSummary(
    version,
    argArray,
    exitCode,
    parseJsonSummary(stdout),
  );
  if (exitCode !== 0) {
    core.setFailed(`${TOOL_NAME} exited with code ${exitCode}`);
  }
}

run().catch((error: unknown) => {
  if (error instanceof Error) {
    core.setFailed(error.message);
  } else {
    core.setFailed(String(error));
  }
});
