/**
 * File filtering logic for repository indexing.
 * Defines patterns for directories/files to exclude and file size limits.
 */

// Directories to completely skip
const EXCLUDE_DIRS = [
  "node_modules",
  ".git",
  ".github",
  "dist",
  "build",
  "out",
  ".next",
  ".venv",
  "venv",
  "__pycache__",
  ".pytest_cache",
  ".tox",
  "target",
  ".gradle",
  ".mvn",
  ".bundle",
  "vendor",
  ".cache",
];

// File patterns to exclude (lockfiles, builds, etc.)
const EXCLUDE_FILE_PATTERNS = [
  /package-lock\.json$/i,
  /yarn\.lock$/i,
  /pnpm-lock\.yaml$/i,
  /\.lock$/i,
  /^\.env.*$/i,
  /\.min\.(js|css)$/i,
  /\.map$/i,
  /\.(pyc|pyo|pyd)$/i,
  /\.(o|a|so|dylib)$/i,
  /\.(jpg|jpeg|png|gif|webp|ico|svg)$/i,
  /\.(mp4|mp3|wav|mov|avi)$/i,
  /\.(zip|tar|gz|rar|7z)$/i,
  /\.(woff|woff2|ttf|eot)$/i,
  /\.DS_Store$/i,
  /thumbs\.db$/i,
];

// File extensions to index (source code only)
const INCLUDE_FILE_EXTENSIONS = [
  // TypeScript/JavaScript
  "ts",
  "tsx",
  "js",
  "jsx",
  "mjs",
  "cjs",
  // Python
  "py",
  "pyi",
  // Java/Kotlin
  "java",
  "kt",
  "scala",
  // C/C++/C#
  "c",
  "cpp",
  "cc",
  "cxx",
  "h",
  "hpp",
  "cs",
  // Go
  "go",
  // Rust
  "rs",
  // Ruby
  "rb",
  // PHP
  "php",
  // Swift
  "swift",
  // Objective-C
  "m",
  "mm",
  // Shell
  "sh",
  "bash",
  "zsh",
  // Web templates
  "html",
  "htm",
  "vue",
  "svelte",
  // Styles
  "css",
  "scss",
  "sass",
  "less",
  // Config/markup
  "json",
  "yaml",
  "yml",
  "toml",
  "xml",
  "md",
  "txt",
  "sql",
  "graphql",
  "gql",
];

const MAX_FILE_SIZE_BYTES = 1024 * 1024; // 1MB

/**
 * Determine if a file path should be indexed.
 */
export function shouldIndexFile(filePath: string, fileSizeBytes?: number): boolean {
  // Check file size if provided
  if (fileSizeBytes && fileSizeBytes > MAX_FILE_SIZE_BYTES) {
    return false;
  }

  // Normalize path separators
  const normalizedPath = filePath.replace(/\\/g, "/");

  // Check if path contains excluded directories
  for (const excludeDir of EXCLUDE_DIRS) {
    if (
      normalizedPath.startsWith(`${excludeDir}/`) ||
      normalizedPath.includes(`/${excludeDir}/`) ||
      normalizedPath === excludeDir ||
      normalizedPath.endsWith(`/${excludeDir}`)
    ) {
      return false;
    }
  }

  // Check exclude patterns
  for (const pattern of EXCLUDE_FILE_PATTERNS) {
    if (pattern.test(normalizedPath)) {
      return false;
    }
  }

  // Check if file extension is in the include list
  const ext = normalizedPath.split(".").pop()?.toLowerCase();
  if (!ext || !INCLUDE_FILE_EXTENSIONS.includes(ext)) {
    return false;
  }

  return true;
}

/**
 * Create exclude patterns (RegExp) from directory names for use in file walking.
 */
export function getExcludePatterns(): RegExp[] {
  return EXCLUDE_DIRS.map(
    (dir) => new RegExp(`(^|/)${dir.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(/|$)`)
  );
}

export { MAX_FILE_SIZE_BYTES };
