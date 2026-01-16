import { Button } from "@opencode-ai/ui/button";
import { Icon } from "@opencode-ai/ui/icon";
import { Select } from "@opencode-ai/ui/select";
import { Tag } from "@opencode-ai/ui/tag";
import { TextField } from "@opencode-ai/ui/text-field";
import { showToast } from "@opencode-ai/ui/toast";
import { For, Show } from "solid-js";
import { createStore } from "solid-js/store";
import type { SkillInfo, SkillLocation, SkillRoots } from "@/pages/orchestra/orchestra-types";
import { copyToClipboard, notifySaveError, notifySaveSuccess, runNodeScript } from "@/pages/orchestra/orchestra-utils";
import { useGlobalSDK } from "@/context/global-sdk";

const locationLabels: Record<SkillLocation, string> = {
  project: "Project",
  global: "Global",
  config: "Config",
};

export function SkillsTab(props: { skills: SkillInfo[]; roots: SkillRoots; onRefresh: () => void; defaultDirectory: string }) {
  const sdk = useGlobalSDK();
  const [state, setState] = createStore({
    skillName: "",
    source: "anthropics/skills",
    location: "global" as SkillLocation,
  });

  const buildSkillScript = (payload: { action: "install" | "delete" | "list"; source?: string; skills?: string[]; location?: SkillLocation }) => {
    const data = JSON.stringify(payload);
    return `const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const payload = ${data};
const projectDir = process.cwd();
const roots = {
  project: path.join(projectDir, '.opencode', 'skill'),
  global: path.join(os.homedir(), '.claude', 'skills'),
  config: path.join(os.homedir(), '.config', 'opencode', 'skill')
};
const resolveSource = (source) => {
  const DEFAULT = 'https://github.com/anthropics/skills';
  if (!source || source === 'anthropics/skills') return { url: DEFAULT, name: 'anthropics-skills' };
  if (source.startsWith('git:')) {
    const url = source.slice(4);
    return { url, name: path.basename(url).replace(/\.git$/, '') || 'custom-skill' };
  }
  if (source.startsWith('http://') || source.startsWith('https://')) {
    return { url: source, name: path.basename(source).replace(/\.git$/, '') || 'custom-skill' };
  }
  return { url: source, name: path.basename(source).replace(/\.git$/, '') || 'custom-skill' };
};
const listSkills = () => {
  const parseFrontmatter = (content) => {
    const match = content.match(/^---\n([\s\S]*?)\n---/);
    if (!match) return {};
    const lines = match[1].split('\n');
    const data = {};
    for (const line of lines) {
      const [key, ...rest] = line.split(':');
      if (!key || rest.length === 0) continue;
      data[key.trim()] = rest.join(':').trim().replace(/^['"]|['"]$/g, '');
    }
    return data;
  };

  const locations = [
    { root: roots.project, location: 'project' },
    { root: roots.global, location: 'global' },
    { root: roots.config, location: 'config' }
  ];
  const skills = [];
  for (const entry of locations) {
    if (!fs.existsSync(entry.root)) continue;
    const entries = fs.readdirSync(entry.root, { withFileTypes: true });
    for (const item of entries) {
      if (!item.isDirectory()) continue;
      const skillId = item.name;
      const skillPath = path.join(entry.root, skillId, 'SKILL.md');
      if (!fs.existsSync(skillPath)) continue;
      const content = fs.readFileSync(skillPath, 'utf-8');
      const meta = parseFrontmatter(content);
      skills.push({
        id: skillId,
        name: meta.name || skillId,
        description: meta.description || '',
        path: skillPath,
        location: entry.location,
      });
    }
  }
  return { roots, skills };
};

if (payload.action === 'install') {
  const location = payload.location || 'global';
  const root = location === 'project' ? roots.project : location === 'config' ? roots.config : roots.global;
  fs.mkdirSync(root, { recursive: true });
  const resolved = resolveSource(payload.source || 'anthropics/skills');
  const sourceRoot = path.join(projectDir, '.opencode', 'workforce', 'skill-sources', resolved.name);
  fs.mkdirSync(path.dirname(sourceRoot), { recursive: true });
  if (fs.existsSync(sourceRoot)) {
    try {
      execSync("git -C \"" + sourceRoot + "\" pull --ff-only", { stdio: "ignore" });
    } catch {}
  } else {
    execSync("git clone \"" + resolved.url + "\" \"" + sourceRoot + "\"", { stdio: "ignore" });
  }
  for (const skill of payload.skills || []) {
    const sourcePath = path.join(sourceRoot, 'skills', skill);
    const destination = path.join(root, skill);
    if (!fs.existsSync(sourcePath)) throw new Error("Skill not found: " + skill);
    fs.rmSync(destination, { recursive: true, force: true });
    fs.cpSync(sourcePath, destination, { recursive: true });
  }
}

if (payload.action === 'delete') {
  const location = payload.location || 'global';
  const root = location === 'project' ? roots.project : location === 'config' ? roots.config : roots.global;
  for (const skill of payload.skills || []) {
    fs.rmSync(path.join(root, skill), { recursive: true, force: true });
  }
}

const state = listSkills();
const outPath = path.join(projectDir, '.opencode', 'workforce', 'skills.json');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(state, null, 2));`;
  };

  const runSkillAction = async (action: "install" | "delete" | "list") => {
    const skill = state.skillName.trim();
    if ((action === "install" || action === "delete") && !skill) {
      showToast({
        title: "Enter a skill name",
        description: "Provide a skill ID before continuing.",
        variant: "error",
      });
      return;
    }

    try {
      const script = buildSkillScript({
        action,
        source: state.source.trim(),
        skills: skill ? [skill] : [],
        location: state.location,
      });
      await runNodeScript(sdk.client, props.defaultDirectory, script);
      notifySaveSuccess(action === "delete" ? "delete" : "update", "skills");
      props.onRefresh();
    } catch (err) {
      notifySaveError("skills", err);
    }
  };

  const copySkillCommand = async (action: "install" | "delete") => {
    const skill = state.skillName.trim();
    if (!skill) {
      showToast({
        title: "Enter a skill name",
        description: "Provide a skill ID before copying the command.",
        variant: "error",
      });
      return;
    }

    const payload = JSON.stringify({
      source: state.source.trim(),
      skills: [skill],
      location: state.location,
    }, null, 2);

    await copyToClipboard(`Use tool skill_${action} with:\n${payload}`, "Command copied");
  };

  return (
    <div class="space-y-6">
      <div class="space-y-1">
        <div class="text-14-regular text-text-weak">
          {props.skills.length} skill{props.skills.length !== 1 ? "s" : ""} discovered
        </div>
        <div class="text-12-regular text-text-weaker">
          Project roots: {props.roots.project.length ? props.roots.project.join(", ") : "—"}
        </div>
        <div class="text-12-regular text-text-weaker">
          Global root: {props.roots.global ?? "—"}
        </div>
        <div class="text-12-regular text-text-weaker">
          Config root: {props.roots.config ?? "—"}
        </div>
      </div>

      <div class="border border-border-base rounded-lg p-4 space-y-3 bg-surface-raised-base">
        <div class="flex items-center gap-2">
          <Icon name="checklist" class="size-4 text-text-accent" />
          <span class="text-13-medium text-text-base">Manage skills</span>
        </div>
        <div class="grid gap-3 sm:grid-cols-2">
          <TextField
            label="Skill ID"
            placeholder="e.g. ralph-wiggum"
            value={state.skillName}
            onChange={(value) => setState("skillName", value)}
          />
          <TextField
            label="Source"
            placeholder="anthropics/skills"
            value={state.source}
            onChange={(value) => setState("source", value)}
          />
        </div>
        <div class="space-y-1.5">
          <label class="text-12-medium text-text-weak">Install location</label>
          <Select
            options={["global", "project", "config"] as SkillLocation[]}
            current={state.location}
            value={(value) => value}
            label={(value) => locationLabels[value]}
            onSelect={(value) => value && setState("location", value)}
            variant="secondary"
            class="w-full"
          />
        </div>
        <div class="flex flex-wrap gap-2">
          <Button variant="secondary" size="small" onClick={() => runSkillAction("install")}>
            <Icon name="plus" class="size-4" />
            Install skill
          </Button>
          <Button variant="ghost" size="small" onClick={() => runSkillAction("delete")}>
            <Icon name="circle-x" class="size-4" />
            Delete skill
          </Button>
          <Button variant="ghost" size="small" onClick={() => runSkillAction("list")}>
            <Icon name="branch" class="size-4" />
            Refresh list
          </Button>
          <Button variant="ghost" size="small" onClick={() => copySkillCommand("install")}>
            <Icon name="copy" class="size-4" />
            Copy install command
          </Button>
        </div>
        <p class="text-12-regular text-text-weaker">
          Install/delete runs on the server via a background script. Use copy for manual fallback.
        </p>
      </div>

      <div class="border border-border-base rounded-lg overflow-hidden">
        <table class="w-full">
          <thead>
            <tr class="bg-surface-raised-base border-b border-border-base">
              <th class="text-left px-4 py-2 text-12-medium text-text-weak font-medium">Name</th>
              <th class="text-left px-4 py-2 text-12-medium text-text-weak font-medium hidden sm:table-cell">Location</th>
              <th class="text-left px-4 py-2 text-12-medium text-text-weak font-medium hidden md:table-cell">Description</th>
              <th class="text-left px-4 py-2 text-12-medium text-text-weak font-medium">ID</th>
            </tr>
          </thead>
          <tbody>
            <For
              each={props.skills}
              fallback={
                <tr>
                  <td colspan="4" class="px-4 py-8 text-center text-text-weak">
                    <div class="flex flex-col items-center gap-2">
                      <Icon name="checklist" class="size-8 opacity-50" />
                      <p class="text-14-regular">No skills found</p>
                    </div>
                  </td>
                </tr>
              }
            >
              {(skill) => (
                <tr class="border-b border-border-base last:border-b-0">
                  <td class="px-4 py-3">
                    <div class="flex flex-col gap-0.5">
                      <span class="text-14-medium text-text-strong">{skill.name}</span>
                      <span class="text-12-regular text-text-weak truncate max-w-xs">{skill.path}</span>
                    </div>
                  </td>
                  <td class="px-4 py-3 hidden sm:table-cell">
                    <Tag size="normal">{locationLabels[skill.location]}</Tag>
                  </td>
                  <td class="px-4 py-3 hidden md:table-cell">
                    <span class="text-12-regular text-text-weak">
                      <Show when={skill.description} fallback="—">
                        {skill.description}
                      </Show>
                    </span>
                  </td>
                  <td class="px-4 py-3 text-12-regular text-text-weak font-mono">{skill.id}</td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </div>
    </div>
  );
}
