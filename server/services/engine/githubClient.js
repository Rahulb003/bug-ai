import { createAppError } from "../../utils/errors.js";

const allowedSource = /\.(js|jsx|mjs|cjs|ts|tsx|py|java|cpp|cc|cxx|c|cs|go|rs|rb|php|swift|kt|kts|sql|sh|bash|html|htm|css|dart|r)$/i;
const projectMetadata = /(?:^|\/)(?:package(?:-lock)?\.json|requirements\.txt|pyproject\.toml|pom\.xml|build\.gradle|go\.mod|Cargo\.toml|composer\.json|Gemfile)$/i;
const ignoredPathPart = new Set(["node_modules", ".git", "dist", "build", "coverage", "target", "bin", "obj", "venv", ".venv", "__pycache__"]);
const MAX_FILES = 100;
const MAX_FILE_CHARS = 200000;
const MAX_TOTAL_CHARS = 2_000_000;

function parseGithubUrl(value) {
  let url;
  try { url = new URL(String(value)); } catch { throw createAppError(400, "Enter a valid public GitHub HTTPS repository URL."); }
  if (url.protocol !== "https:" || url.hostname !== "github.com") throw createAppError(400, "Only public https://github.com owner/repository URLs are supported.");
  const [owner, repo] = url.pathname.split("/").filter(Boolean);
  if (!owner || !repo || !/^[\w.-]+$/.test(owner) || !/^[\w.-]+$/.test(repo)) throw createAppError(400, "Enter a valid public GitHub repository URL.");
  return { owner, repo: repo.replace(/\.git$/i, "") };
}

async function githubFetch(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try { return await fetch(url, { headers: { Accept: "application/vnd.github+json", "User-Agent": "BUG-AI" }, signal: controller.signal }); }
  finally { clearTimeout(timeout); }
}

export async function fetchGithubRepositoryFiles(repoUrl) {
  const { owner, repo } = parseGithubUrl(repoUrl);
  const repoResponse = await githubFetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`);
  if (!repoResponse.ok) throw createAppError(502, "GitHub repository could not be reached or is not public.");
  const repository = await repoResponse.json();
  const treeResponse = await githubFetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/${encodeURIComponent(repository.default_branch)}?recursive=1`);
  if (!treeResponse.ok) throw createAppError(502, "GitHub repository tree could not be loaded.");
  const tree = await treeResponse.json();
  const candidates = (tree.tree || []).filter((item) => item.type === "blob" && (allowedSource.test(item.path) || projectMetadata.test(item.path)) && !item.path.split("/").some((part) => ignoredPathPart.has(part) || part === "..")).slice(0, MAX_FILES);
  if (!candidates.length) throw createAppError(400, "No supported source files were found in that repository.");
  let loadedCharacters = 0;
  const loaded = await Promise.all(candidates.map(async (file) => {
    const branch = encodeURIComponent(repository.default_branch);
    const path = file.path.split("/").map(encodeURIComponent).join("/");
    const response = await githubFetch(`https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${branch}/${path}`);
    if (!response.ok) return null;
    const content = (await response.text()).slice(0, MAX_FILE_CHARS);
    // The final cap is enforced below as requests finish concurrently.
    return { name: file.path, path: file.path, content };
  }));
  const files = loaded.filter(Boolean).filter((file) => {
    if (loadedCharacters + file.content.length > MAX_TOTAL_CHARS) return false;
    loadedCharacters += file.content.length;
    return true;
  });
  if (!files.length) throw createAppError(502, "Repository files could not be downloaded.");
  return files;
}
