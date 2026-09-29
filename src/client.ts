import { execFile } from "node:child_process";
import { realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";

export type Argument = { name: string; position: number; required: boolean; default?: string; choices?: string[]; help?: string };
export type Workflow = { name: string; source: string; format: "toml" | "tsx"; description: string | null; args: Argument[] | null };
export type DescribedWorkflow = Workflow & { args: Argument[] };
export type Metadata = { project: string; workflows: Workflow[] };
export type Execute = (file: string, args: string[]) => Promise<string>;

export const execute: Execute = (file, args) => new Promise((resolve, reject) => {
  const child = execFile(file, args, { maxBuffer: 4 * 1024 * 1024 }, (error, stdout, stderr) => {
    if (error) reject(new Error(stderr.trim() || stdout.trim() || error.message));
    else {
      if (stderr) console.error(stderr);
      resolve(stdout);
    }
  });
  child.stdin?.end();
});

function envelope(output: string): Record<string, unknown> {
  let data;
  try { data = JSON.parse(output); }
  catch { throw new Error("Layouter returned invalid metadata JSON. Update Layouter to a version supporting the metadata API."); }
  if (data?.schema_version !== 1) throw new Error("Unsupported Layouter metadata schema; expected version 1. Update Layouter or this extension.");
  return data;
}

function workflowRecord(value: unknown): Workflow {
  const w = value as Workflow | null;
  if (!w || typeof w.name !== "string" || typeof w.source !== "string" || !isAbsolute(w.source) ||
      !["toml", "tsx"].includes(w.format) || !(w.description === null || typeof w.description === "string") ||
      !(w.args === null || Array.isArray(w.args))) throw new Error("Invalid Layouter workflow metadata.");
  if (w.args !== null) {
    for (const [index, arg] of w.args.entries()) {
      if (!arg || typeof arg.name !== "string" || arg.position !== index || typeof arg.required !== "boolean" ||
          (!arg.required && typeof arg.default !== "string") ||
          (arg.default !== undefined && typeof arg.default !== "string") ||
          (arg.help !== undefined && typeof arg.help !== "string") ||
          (arg.choices !== undefined && (!Array.isArray(arg.choices) || !arg.choices.length || arg.choices.some(c => typeof c !== "string")))) {
        throw new Error("Invalid Layouter argument metadata.");
      }
    }
  }
  return w;
}

export async function projectDirectory(text: string): Promise<string> {
  const path = !text || text === "~" ? homedir() : text.startsWith("~/") ? join(homedir(), text.slice(2)) : text;
  try {
    if (isAbsolute(path) && (await stat(path)).isDirectory()) return await realpath(path);
  } catch { /* Report the same actionable error for invalid paths. */ }
  throw new Error("Project must be an existing absolute directory (~/ is supported).");
}

export function argumentValues(args: Argument[] | null, values: Record<string, unknown>): string[] {
  if (args === null) throw new Error("Wait for workflow arguments to load.");
  return args.map(arg => {
    const value = String(values[`argument-${arg.position}`] ?? arg.default ?? "");
    if (arg.choices && !arg.choices.includes(value)) throw new Error(`Choose a valid value for ${arg.name}.`);
    // Empty strings are supplied values, even for required arguments. Layouter validates them.
    return value;
  });
}

export function createClient(executable: string, run: Execute = execute) {
  const sourceOptions = (project: string, workflow: Workflow) => ["-C", project, "--file", workflow.source];
  return {
    async list(projectText: string): Promise<Metadata> {
      const project = await projectDirectory(projectText);
      const data = envelope(await run(executable, ["-C", project, ...(!projectText ? ["--global"] : []), "--list", "--json"]));
      if (!Array.isArray(data.workflows)) throw new Error("Invalid Layouter workflow list.");
      return { project, workflows: data.workflows.map(workflowRecord) };
    },
    async describe(project: string, selected: Workflow): Promise<DescribedWorkflow> {
      const data = envelope(await run(executable, [...sourceOptions(project, selected), "--describe", "--json", selected.name]));
      const workflow = workflowRecord(data.workflow);
      if (workflow.args === null || workflow.name !== selected.name || workflow.source !== selected.source) {
        throw new Error("Layouter returned inconsistent workflow metadata. Reload the workflow list.");
      }
      return workflow as DescribedWorkflow;
    },
    check(project: string, workflow: Workflow, values: string[]) {
      return run(executable, [...sourceOptions(project, workflow), "--check", workflow.name, ...values]);
    },
    launch(project: string, workflow: Workflow, values: string[]) {
      return run(executable, [...sourceOptions(project, workflow), workflow.name, ...values]);
    },
  };
}
