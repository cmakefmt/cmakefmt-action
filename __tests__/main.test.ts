// SPDX-FileCopyrightText: Copyright 2026 Puneet Matharu
//
// SPDX-License-Identifier: MIT OR Apache-2.0

import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";

const actualOs = jest.requireActual<typeof import("os")>("os");

// ---------------------------------------------------------------------------
// Mocks — factory functions so Jest never loads the real ESM modules
// ---------------------------------------------------------------------------

jest.mock("os", () => ({
  ...jest.requireActual("os"),
  platform: jest.fn(() => actualOs.platform()),
  arch: jest.fn(() => actualOs.arch()),
}));

jest.mock("@actions/core", () => ({
  getInput: jest.fn(),
  setOutput: jest.fn(),
  addPath: jest.fn(),
  setFailed: jest.fn(),
  info: jest.fn(),
}));

jest.mock("@actions/exec", () => ({
  exec: jest.fn(),
}));

jest.mock("@actions/tool-cache", () => ({
  find: jest.fn(),
  downloadTool: jest.fn(),
  extractTar: jest.fn(),
  extractZip: jest.fn(),
  cacheDir: jest.fn(),
}));

jest.mock("@actions/http-client", () => ({
  HttpClient: jest.fn(),
}));

import * as core from "@actions/core";
import * as exec from "@actions/exec";
import * as httpm from "@actions/http-client";
import * as tc from "@actions/tool-cache";

import * as os from "os";

import {
  buildArgs,
  computeSha256,
  getTarget,
  install,
  resolveVersion,
  run,
  verifyChecksum,
} from "../src/main";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockPlatform(platform: string, arch: string): void {
  (os.platform as jest.Mock).mockReturnValue(platform);
  (os.arch as jest.Mock).mockReturnValue(arch);
}

// ---------------------------------------------------------------------------
// getTarget
// ---------------------------------------------------------------------------

describe("getTarget", () => {
  afterEach(() => jest.clearAllMocks());

  it.each([
    ["linux", "x64", "x86_64-unknown-linux-musl", "tar.gz"],
    ["linux", "arm64", "aarch64-unknown-linux-gnu", "tar.gz"],
    ["darwin", "x64", "x86_64-apple-darwin", "tar.gz"],
    ["darwin", "arm64", "aarch64-apple-darwin", "tar.gz"],
    ["win32", "x64", "x86_64-pc-windows-msvc", "zip"],
  ])(
    "returns %s/%s → %s (.%s)",
    (platform, arch, expectedTriple, expectedExt) => {
      mockPlatform(platform, arch);

      const target = getTarget();
      expect(target.triple).toBe(expectedTriple);
      expect(target.ext).toBe(expectedExt);
    },
  );

  it("throws on unsupported platform", () => {
    mockPlatform("freebsd", "x64");
    expect(() => getTarget()).toThrow("Unsupported platform/architecture");
  });

  it("throws on unsupported architecture", () => {
    mockPlatform("linux", "s390x");
    expect(() => getTarget()).toThrow("Unsupported platform/architecture");
  });
});

// ---------------------------------------------------------------------------
// resolveVersion
// ---------------------------------------------------------------------------

describe("resolveVersion", () => {
  it("passes through a pinned version", async () => {
    expect(await resolveVersion("0.3.0", "tok")).toBe("0.3.0");
  });

  it("strips leading v from a pinned version", async () => {
    expect(await resolveVersion("v0.3.0", "tok")).toBe("0.3.0");
  });

  it("resolves 'latest' via the GitHub API", async () => {
    const mockGetJson = jest.fn().mockResolvedValue({
      result: { tag_name: "v0.3.0" },
      statusCode: 200,
      headers: {},
    });
    (httpm.HttpClient as jest.Mock).mockImplementation(() => ({
      getJson: mockGetJson,
    }));

    const version = await resolveVersion("latest", "my-token");
    expect(version).toBe("0.3.0");
    expect(mockGetJson).toHaveBeenCalledWith(
      "https://api.github.com/repos/cmakefmt/cmakefmt/releases/latest",
      expect.objectContaining({
        Authorization: "Bearer my-token",
      }),
    );
  });

  it("throws when the API returns no tag_name", async () => {
    (httpm.HttpClient as jest.Mock).mockImplementation(() => ({
      getJson: jest.fn().mockResolvedValue({ result: null }),
    }));

    await expect(resolveVersion("latest", "tok")).rejects.toThrow(
      "Failed to resolve latest cmakefmt version",
    );
  });
});

// ---------------------------------------------------------------------------
// computeSha256
// ---------------------------------------------------------------------------

describe("computeSha256", () => {
  it("computes the correct hash", () => {
    const tmpFile = path.join(os.tmpdir(), "cmakefmt-test-hash");
    fs.writeFileSync(tmpFile, "hello world\n");

    const expected = crypto
      .createHash("sha256")
      .update("hello world\n")
      .digest("hex");
    expect(computeSha256(tmpFile)).toBe(expected);

    fs.unlinkSync(tmpFile);
  });
});

// ---------------------------------------------------------------------------
// verifyChecksum
// ---------------------------------------------------------------------------

describe("verifyChecksum", () => {
  const archive = "cmakefmt-0.3.0-x86_64-unknown-linux-musl.tar.gz";
  const baseUrl =
    "https://github.com/cmakefmt/cmakefmt/releases/download/v0.3.0";

  let archivePath: string;
  let archiveHash: string;

  beforeEach(() => {
    archivePath = path.join(os.tmpdir(), "cmakefmt-test-archive");
    fs.writeFileSync(archivePath, "binary-content");
    archiveHash = crypto
      .createHash("sha256")
      .update("binary-content")
      .digest("hex");
  });

  afterEach(() => {
    if (fs.existsSync(archivePath)) fs.unlinkSync(archivePath);
  });

  it("passes when the checksum matches", async () => {
    const checksumFile = path.join(os.tmpdir(), "SHA256SUMS-test");
    fs.writeFileSync(
      checksumFile,
      `${archiveHash}  ${archive}\n` +
        `deadbeef  ${archive}.sigstore\n`,
    );
    (tc.downloadTool as jest.Mock).mockResolvedValue(checksumFile);

    await expect(
      verifyChecksum(archivePath, baseUrl, archive),
    ).resolves.toBeUndefined();

    fs.unlinkSync(checksumFile);
  });

  it("throws on checksum mismatch", async () => {
    const checksumFile = path.join(os.tmpdir(), "SHA256SUMS-test");
    fs.writeFileSync(checksumFile, `badhash  ${archive}\n`);
    (tc.downloadTool as jest.Mock).mockResolvedValue(checksumFile);

    await expect(
      verifyChecksum(archivePath, baseUrl, archive),
    ).rejects.toThrow("Checksum mismatch");

    fs.unlinkSync(checksumFile);
  });

  it("throws when the archive is not in SHA256SUMS", async () => {
    const checksumFile = path.join(os.tmpdir(), "SHA256SUMS-test");
    fs.writeFileSync(checksumFile, "abc123  other-file.tar.gz\n");
    (tc.downloadTool as jest.Mock).mockResolvedValue(checksumFile);

    await expect(
      verifyChecksum(archivePath, baseUrl, archive),
    ).rejects.toThrow("not found in SHA256SUMS");

    fs.unlinkSync(checksumFile);
  });

  it("matches exact filename, not substring", async () => {
    const checksumFile = path.join(os.tmpdir(), "SHA256SUMS-test");
    fs.writeFileSync(checksumFile, `${archiveHash}  ${archive}.sigstore\n`);
    (tc.downloadTool as jest.Mock).mockResolvedValue(checksumFile);

    await expect(
      verifyChecksum(archivePath, baseUrl, archive),
    ).rejects.toThrow("not found in SHA256SUMS");

    fs.unlinkSync(checksumFile);
  });
});

// ---------------------------------------------------------------------------
// install
// ---------------------------------------------------------------------------

describe("install", () => {
  afterEach(() => jest.clearAllMocks());

  it("returns the cached path when available", async () => {
    mockPlatform("linux", "x64");
    (tc.find as jest.Mock).mockReturnValue("/cached/cmakefmt");

    const result = await install("0.3.0");
    expect(result).toBe("/cached/cmakefmt");
    expect(tc.downloadTool).not.toHaveBeenCalled();
  });

  it("downloads, verifies, extracts, and caches on cache miss", async () => {
    mockPlatform("linux", "x64");
    (tc.find as jest.Mock).mockReturnValue("");

    const archivePath = path.join(os.tmpdir(), "cmakefmt-install-test");
    fs.writeFileSync(archivePath, "archive-data");
    const hash = crypto
      .createHash("sha256")
      .update("archive-data")
      .digest("hex");
    const checksumFile = path.join(os.tmpdir(), "SHA256SUMS-install");
    fs.writeFileSync(
      checksumFile,
      `${hash}  cmakefmt-0.3.0-x86_64-unknown-linux-musl.tar.gz\n`,
    );

    (tc.downloadTool as jest.Mock)
      .mockResolvedValueOnce(archivePath)
      .mockResolvedValueOnce(checksumFile);
    (tc.extractTar as jest.Mock).mockResolvedValue("/tmp/extracted");
    (tc.cacheDir as jest.Mock).mockResolvedValue("/cached/cmakefmt");

    const result = await install("0.3.0");

    expect(tc.downloadTool).toHaveBeenCalledWith(
      expect.stringContaining(
        "cmakefmt-0.3.0-x86_64-unknown-linux-musl.tar.gz",
      ),
    );
    expect(tc.extractTar).toHaveBeenCalledWith(archivePath);
    expect(tc.cacheDir).toHaveBeenCalledWith(
      expect.stringContaining("cmakefmt-0.3.0-x86_64-unknown-linux-musl"),
      "cmakefmt",
      "0.3.0",
    );
    expect(result).toBe("/cached/cmakefmt");

    fs.unlinkSync(archivePath);
    fs.unlinkSync(checksumFile);
  });

  it("uses extractZip on Windows", async () => {
    mockPlatform("win32", "x64");
    (tc.find as jest.Mock).mockReturnValue("");

    const archivePath = path.join(os.tmpdir(), "cmakefmt-win-test");
    fs.writeFileSync(archivePath, "zip-data");
    const hash = crypto
      .createHash("sha256")
      .update("zip-data")
      .digest("hex");
    const checksumFile = path.join(os.tmpdir(), "SHA256SUMS-win");
    fs.writeFileSync(
      checksumFile,
      `${hash}  cmakefmt-0.3.0-x86_64-pc-windows-msvc.zip\n`,
    );

    (tc.downloadTool as jest.Mock)
      .mockResolvedValueOnce(archivePath)
      .mockResolvedValueOnce(checksumFile);
    (tc.extractZip as jest.Mock).mockResolvedValue("/tmp/extracted");
    (tc.cacheDir as jest.Mock).mockResolvedValue("/cached/cmakefmt");

    await install("0.3.0");

    expect(tc.extractZip).toHaveBeenCalledWith(archivePath);
    expect(tc.extractTar).not.toHaveBeenCalled();

    fs.unlinkSync(archivePath);
    fs.unlinkSync(checksumFile);
  });
});

// ---------------------------------------------------------------------------
// buildArgs
// ---------------------------------------------------------------------------

describe("buildArgs", () => {
  it("injects --check and --report-format by default", () => {
    expect(buildArgs(".", true, false, "github")).toEqual([
      "--report-format", "github", "--check", ".",
    ]);
  });

  it("skips --check when check-only is false", () => {
    expect(buildArgs(".", false, false, "github")).toEqual([
      "--report-format", "github", ".",
    ]);
  });

  it("skips --check injection when args already contains --check", () => {
    expect(buildArgs("--check src/", true, false, "github")).toEqual([
      "--report-format", "github", "--check", "src/",
    ]);
  });

  it("skips --check injection when args contains --in-place", () => {
    expect(buildArgs("--in-place .", true, false, "github")).toEqual([
      "--report-format", "github", "--in-place", ".",
    ]);
  });

  it("skips --check injection when args contains -i", () => {
    expect(buildArgs("-i .", true, false, "github")).toEqual([
      "--report-format", "github", "-i", ".",
    ]);
  });

  it("injects --diff when enabled", () => {
    expect(buildArgs(".", true, true, "github")).toEqual([
      "--report-format", "github", "--diff", "--check", ".",
    ]);
  });

  it("skips --diff injection when args already contains --diff", () => {
    expect(buildArgs("--diff .", true, true, "github")).toEqual([
      "--report-format", "github", "--check", "--diff", ".",
    ]);
  });

  it("skips --report-format injection when args already contains it", () => {
    expect(buildArgs("--report-format json .", true, false, "github")).toEqual([
      "--check", "--report-format", "json", ".",
    ]);
  });

  it("skips --report-format injection when input is empty", () => {
    expect(buildArgs(".", true, false, "")).toEqual(["--check", "."]);
  });

  it("handles args with extra whitespace", () => {
    expect(buildArgs("  .  ", true, false, "github")).toEqual([
      "--report-format", "github", "--check", ".",
    ]);
  });
});

// ---------------------------------------------------------------------------
// run (integration)
// ---------------------------------------------------------------------------

describe("run", () => {
  afterEach(() => jest.clearAllMocks());

  beforeEach(() => {
    mockPlatform("linux", "x64");

    (core.getInput as jest.Mock).mockImplementation((name: string) => {
      const inputs: Record<string, string> = {
        version: "0.3.0",
        args: ".",
        "check-only": "true",
        diff: "false",
        "report-format": "github",
        "working-directory": "",
        token: "test-token",
      };
      return inputs[name] ?? "";
    });

    (tc.find as jest.Mock).mockReturnValue("/cached/cmakefmt");
    (exec.exec as jest.Mock).mockResolvedValue(0);
  });

  it("sets the version output", async () => {
    await run();
    expect(core.setOutput).toHaveBeenCalledWith("version", "0.3.0");
  });

  it("adds the install directory to PATH", async () => {
    await run();
    expect(core.addPath).toHaveBeenCalledWith("/cached/cmakefmt");
  });

  it("injects --check and --report-format by default", async () => {
    await run();
    expect(exec.exec).toHaveBeenCalledWith(
      "cmakefmt",
      ["--report-format", "github", "--check", "."],
      {},
    );
  });

  it("injects --diff when enabled", async () => {
    (core.getInput as jest.Mock).mockImplementation((name: string) => {
      const inputs: Record<string, string> = {
        version: "0.3.0",
        args: ".",
        "check-only": "true",
        diff: "true",
        "report-format": "github",
        "working-directory": "",
        token: "test-token",
      };
      return inputs[name] ?? "";
    });

    await run();
    expect(exec.exec).toHaveBeenCalledWith(
      "cmakefmt",
      ["--report-format", "github", "--diff", "--check", "."],
      {},
    );
  });

  it("skips --check when check-only is false", async () => {
    (core.getInput as jest.Mock).mockImplementation((name: string) => {
      const inputs: Record<string, string> = {
        version: "0.3.0",
        args: ".",
        "check-only": "false",
        diff: "false",
        "report-format": "github",
        "working-directory": "",
        token: "test-token",
      };
      return inputs[name] ?? "";
    });

    await run();
    expect(exec.exec).toHaveBeenCalledWith(
      "cmakefmt",
      ["--report-format", "github", "."],
      {},
    );
  });

  it("passes working-directory as cwd", async () => {
    (core.getInput as jest.Mock).mockImplementation((name: string) => {
      const inputs: Record<string, string> = {
        version: "0.3.0",
        args: ".",
        "check-only": "true",
        diff: "false",
        "report-format": "github",
        "working-directory": "sub",
        token: "test-token",
      };
      return inputs[name] ?? "";
    });

    await run();
    expect(exec.exec).toHaveBeenCalledWith(
      "cmakefmt",
      ["--report-format", "github", "--check", "."],
      { cwd: "sub" },
    );
  });

  it("does not run cmakefmt when args is empty", async () => {
    (core.getInput as jest.Mock).mockImplementation((name: string) => {
      const inputs: Record<string, string> = {
        version: "0.3.0",
        args: "",
        "check-only": "true",
        diff: "false",
        "report-format": "github",
        "working-directory": "",
        token: "test-token",
      };
      return inputs[name] ?? "";
    });

    await run();
    expect(exec.exec).not.toHaveBeenCalled();
  });

  it("skips --report-format injection when input is empty", async () => {
    (core.getInput as jest.Mock).mockImplementation((name: string) => {
      const inputs: Record<string, string> = {
        version: "0.3.0",
        args: ".",
        "check-only": "true",
        diff: "false",
        "report-format": "",
        "working-directory": "",
        token: "test-token",
      };
      return inputs[name] ?? "";
    });

    await run();
    expect(exec.exec).toHaveBeenCalledWith(
      "cmakefmt",
      ["--check", "."],
      {},
    );
  });
});
