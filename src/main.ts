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

export function buildArgs(
  args: string,
  checkOnly: boolean,
  diff: boolean,
  reportFormat: string,
): string[] {
  const argArray = args.trim().split(/\s+/);

  // Inject --check unless the user already specified --check or --in-place
  if (
    checkOnly &&
    !argArray.includes("--check") &&
    !argArray.includes("--in-place") &&
    !argArray.includes("-i")
  ) {
    argArray.unshift("--check");
  }

  // Inject --diff unless the user already specified it in args
  if (diff && !argArray.includes("--diff")) {
    argArray.unshift("--diff");
  }

  // Inject --report-format unless the user already specified it in args
  if (reportFormat && !argArray.includes("--report-format")) {
    argArray.unshift("--report-format", reportFormat);
  }

  return argArray;
}

export async function run(): Promise<void> {
  const versionInput = core.getInput("version");
  const args = core.getInput("args");
  const checkOnly = core.getInput("check-only") !== "false";
  const diff = core.getInput("diff") === "true";
  const reportFormat = core.getInput("report-format");
  const workingDirectory = core.getInput("working-directory");
  const token = core.getInput("token", { required: true });

  const version = await resolveVersion(versionInput, token);
  core.setOutput("version", version);
  core.info(`Resolved ${TOOL_NAME} version: ${version}`);

  const installDir = await install(version);
  core.addPath(installDir);

  if (args) {
    const argArray = buildArgs(args, checkOnly, diff, reportFormat);
    const options: exec.ExecOptions = {};
    if (workingDirectory) {
      options.cwd = workingDirectory;
    }
    await exec.exec(TOOL_NAME, argArray, options);
  }
}

run().catch((error: unknown) => {
  if (error instanceof Error) {
    core.setFailed(error.message);
  } else {
    core.setFailed(String(error));
  }
});
