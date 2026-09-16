import { Action, ActionPanel, Form, Toast, closeMainWindow, environment, showToast } from "@vicinae/api";
import type { LaunchProps } from "@vicinae/api";
import { useEffect, useRef, useState } from "react";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

type Argument = { name: string; default?: string; choices?: string[]; help?: string };
type Workflow = { name: string; source: string; args: Argument[]; error?: string };
type Metadata = { project: string; globalOnly: boolean; workflows: Workflow[] };
const executable = existsSync(join(homedir(), ".local/bin/layouter")) ? join(homedir(), ".local/bin/layouter") : "layouter";
function execute(file: string, args: string[], input?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile(file, args, { maxBuffer: 4 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) reject(new Error(stderr.trim() || stdout.trim() || error.message));
      else resolve(stdout);
    });
    child.stdin?.end(input);
  });
}

export default function Layouter(props: LaunchProps<{ arguments: { project?: string } }>) {
  const [workflow, setWorkflow] = useState("default");
  const [metadata, setMetadata] = useState<Metadata>();
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const busy = useRef(false);
  const selected = metadata?.workflows.find(w => w.name === workflow);
  const projectPath = props.arguments?.project || "";

  useEffect(() => {
    let current = true;
    setLoading(true); setMetadata(undefined); setError(""); setValues({});
    execute("python3", [join(environment.assetsPath, "workflows.py")], JSON.stringify({ project: projectPath, executable }))
      .then(output => { if (current) setMetadata(JSON.parse(output)); })
      .catch(e => { if (current) setError(e.message); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [projectPath]);

  useEffect(() => {
    setValues(Object.fromEntries((selected?.args || []).map(a => [a.name, a.default ?? ""])));
  }, [selected]);

  async function submit(formValues: Form.Values) {
    if (busy.current) return;
    if (loading) { setError("Wait for workflows to load."); return; }
    if (!metadata) return;
    if (!selected) { setError(`Workflow '${workflow}' was not found. Choose an available workflow or a project containing it.`); return; }
    if (selected.error) { setError(selected.error); return; }
    const args: string[] = [];
    for (const [index, arg] of selected.args.entries()) {
      const value = String(formValues[`argument-${index}`] ?? values[arg.name] ?? "");
      if ((!value && arg.default === undefined && !arg.choices?.includes("")) || (arg.choices && !arg.choices.includes(value))) {
        setError(`Choose or enter a valid value for ${arg.name}.`); return;
      }
      args.push(value);
    }
    busy.current = true; setRunning(true); setError("");
    const base = ["-C", metadata.project, ...(metadata.globalOnly ? ["--global"] : [])];
    try {
      await execute(executable, [...base, "--check", workflow, ...args]);
      await showToast({ style: Toast.Style.Animated, title: "Starting workflow", message: workflow });
      await execute(executable, [...base, workflow, ...args]);
      await showToast({ style: Toast.Style.Success, title: "Workspace ready", message: workflow });
      await closeMainWindow();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
      await showToast({ style: Toast.Style.Failure, title: "Layouter", message });
    } finally { busy.current = false; setRunning(false); }
  }

  return <Form navigationTitle={projectPath ? `Layouter — ${metadata?.project || projectPath}` : "Layouter — Global workflows"} isLoading={loading || running} actions={
    <ActionPanel><Action.SubmitForm title={running ? "Running…" : "Run Workflow"} onSubmit={submit} /></ActionPanel>
  }>
    <Form.Dropdown id="workflow" title="Workflow" value={workflow} filtering autoFocus
      onChange={value => { if (!busy.current) { setWorkflow(value); setError(""); } }}>
      {!metadata?.workflows.some(w => w.name === "default") && <Form.Dropdown.Item value="default" title="default" />}
      {metadata?.workflows.map(w => <Form.Dropdown.Item key={w.name} value={w.name} title={w.name} />)}
    </Form.Dropdown>
    {selected?.args.map((arg, index) => arg.choices ?
      <Form.Dropdown key={`${selected.source}:${workflow}:${arg.name}`} id={`argument-${index}`} title={arg.name}
        value={values[arg.name] ?? arg.default ?? ""} filtering info={arg.help}
        onChange={value => setValues(old => ({ ...old, [arg.name]: value }))}>
        {arg.default === undefined && !arg.choices.includes("") && <Form.Dropdown.Item value="" title="Choose a value…" />}
        {arg.choices.map(choice => <Form.Dropdown.Item key={choice} value={choice} title={choice || "(empty)"} />)}
      </Form.Dropdown> :
      <Form.TextField key={`${selected.source}:${workflow}:${arg.name}`} id={`argument-${index}`} title={arg.name}
        value={values[arg.name] ?? arg.default ?? ""} placeholder={arg.default === undefined ? "Required" : "Optional"}
        info={arg.help} onChange={value => setValues(old => ({ ...old, [arg.name]: value }))} />)}
    {(error || selected?.error) && <Form.Description title="Error" text={error || selected?.error || ""} />}
  </Form>;
}
