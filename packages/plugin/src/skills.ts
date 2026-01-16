import { access, cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { basename, dirname, join } from "node:path"

export type SkillLocation = "project" | "global" | "config"

export type SkillSummary = {
  id: string
  name: string
  description: string
  path: string
  location: SkillLocation
}

export type SkillState = {
  roots: {
    project?: string
    global?: string
    config?: string
  }
  skills: SkillSummary[]
}

export type SkillInstallInput = {
  source: string
  skills: string[]
  location?: string
}

export type SkillInstallResult = {
  source: string
  root: string
  installed: string[]
  errors: Array<{ skill: string; error: string }>
}

export type SkillDeleteInput = {
  skills: string[]
  location?: string
}

export type SkillDeleteResult = {
  root: string
  removed: string[]
  errors: Array<{ skill: string; error: string }>
}

const DEFAULT_SOURCE = "https://github.com/anthropics/skills"

const pathExists = async (path: string): Promise<boolean> => {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

const parseFrontmatter = (content: string): { name?: string; description?: string } => {
  const match = content.match(/^---\s*([\s\S]*?)\s*---/)
  if (!match) return {}
  const frontmatter = match[1]
  const lines = frontmatter.split("\n")
  const data: Record<string, string> = {}
  for (const line of lines) {
    const [key, ...rest] = line.split(":")
    if (!key || rest.length === 0) continue
    data[key.trim()] = rest.join(":").trim().replace(/^['"]|['"]$/g, "")
  }
  return {
    name: data.name,
    description: data.description
  }
}

export const getSkillRoots = (projectDir: string) => {
  return {
    project: join(projectDir, ".opencode", "skill"),
    global: join(homedir(), ".claude", "skills"),
    config: join(homedir(), ".config", "opencode", "skill")
  }
}

const listSkillsInRoot = async (root: string, location: SkillLocation): Promise<SkillSummary[]> => {
  const exists = await pathExists(root)
  if (!exists) return []

  const entries = await readdir(root, { withFileTypes: true })
  const skills: SkillSummary[] = []

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const skillId = entry.name
    const skillPath = join(root, skillId, "SKILL.md")
    if (!(await pathExists(skillPath))) continue

    const content = await readFile(skillPath, "utf-8")
    const meta = parseFrontmatter(content)
    skills.push({
      id: skillId,
      name: meta.name ?? skillId,
      description: meta.description ?? "",
      path: skillPath,
      location
    })
  }

  return skills
}

export const listSkills = async (projectDir: string): Promise<SkillState> => {
  const roots = getSkillRoots(projectDir)
  const skills = [
    ...(await listSkillsInRoot(roots.project, "project")),
    ...(await listSkillsInRoot(roots.global, "global")),
    ...(await listSkillsInRoot(roots.config, "config"))
  ]

  return {
    roots,
    skills
  }
}

const normalizeLocation = (location?: string): SkillLocation => {
  if (location === "project" || location === "config") return location
  return "global"
}

const sanitize = (value: string): string => value.toLowerCase().replace(/[^a-z0-9-]+/g, "-")

const resolveSource = (source: string) => {
  if (source === "anthropics/skills") {
    return { url: DEFAULT_SOURCE, name: "anthropics-skills" }
  }

  if (source.startsWith("git:")) {
    const url = source.slice(4)
    return { url, name: sanitize(basename(url).replace(/\.git$/, "")) || "custom-skill" }
  }

  if (source.startsWith("http://") || source.startsWith("https://")) {
    return { url: source, name: sanitize(basename(source).replace(/\.git$/, "")) || "custom-skill" }
  }

  return { url: source, name: sanitize(source) || "custom-skill" }
}

const runCommand = async (command: string[], cwd?: string): Promise<void> => {
  const proc = Bun.spawn(command, { cwd, stdout: "pipe", stderr: "pipe" })
  const output = await new Response(proc.stdout).text()
  const error = await new Response(proc.stderr).text()
  const exitCode = await proc.exited
  if (exitCode !== 0) {
    throw new Error(error || output || `Command failed: ${command.join(" ")}`)
  }
}

const ensureSourceRepo = async (baseDir: string, source: { url: string; name: string }) => {
  const root = join(baseDir, "skill-sources", source.name)
  if (await pathExists(root)) {
    try {
      await runCommand(["git", "-C", root, "pull", "--ff-only"])
    } catch {
      // Ignore pull failures; keep existing checkout
    }
  } else {
    await mkdir(root, { recursive: true })
    await runCommand(["git", "clone", source.url, root])
  }
  return root
}

export const installSkills = async (
  projectDir: string,
  baseDir: string,
  input: SkillInstallInput
): Promise<SkillInstallResult> => {
  const location = normalizeLocation(input.location)
  const roots = getSkillRoots(projectDir)
  const root = location === "project" ? roots.project : location === "config" ? roots.config : roots.global
  const source = resolveSource(input.source)

  await mkdir(root, { recursive: true })

  const sourceRoot = await ensureSourceRepo(baseDir, source)
  const installed: string[] = []
  const errors: Array<{ skill: string; error: string }> = []

  for (const skill of input.skills) {
    const sourcePath = join(sourceRoot, "skills", skill)
    const destinationPath = join(root, skill)
    try {
      if (!(await pathExists(sourcePath))) {
        throw new Error(`Skill not found in source: ${skill}`)
      }
      await rm(destinationPath, { recursive: true, force: true })
      await cp(sourcePath, destinationPath, { recursive: true, force: true })
      installed.push(skill)
    } catch (err: any) {
      errors.push({ skill, error: err?.message ?? String(err) })
    }
  }

  return {
    source: source.url,
    root,
    installed,
    errors
  }
}

export const deleteSkills = async (
  projectDir: string,
  input: SkillDeleteInput
): Promise<SkillDeleteResult> => {
  const location = normalizeLocation(input.location)
  const roots = getSkillRoots(projectDir)
  const root = location === "project" ? roots.project : location === "config" ? roots.config : roots.global
  const removed: string[] = []
  const errors: Array<{ skill: string; error: string }> = []

  for (const skill of input.skills) {
    const target = join(root, skill)
    try {
      await rm(target, { recursive: true, force: true })
      removed.push(skill)
    } catch (err: any) {
      errors.push({ skill, error: err?.message ?? String(err) })
    }
  }

  return {
    root,
    removed,
    errors
  }
}

export const writeSkillsState = async (projectDir: string, state: SkillState): Promise<void> => {
  const target = join(projectDir, ".opencode", "workforce", "skills.json")
  await mkdir(dirname(target), { recursive: true })
  await writeFile(target, JSON.stringify(state, null, 2))
}
