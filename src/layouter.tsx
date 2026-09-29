import { Action, ActionPanel, Form, Toast, closeMainWindow, showToast } from "@vicinae/api";
import type { LaunchProps } from "@vicinae/api";
import { useEffect, useRef, useState } from "react";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { argumentValues, createClient } from "./client";
import type { DescribedWorkflow, Metadata } from "./client";

const executable = existsSync(join(homedir(), ".local/bin/layouter")) ? join(homedir(), ".local/bin/layouter") : "layouter";
const client = createClient(executable);

export default function Layouter(props: LaunchProps<{ arguments: { project?: string } }>) {
  const [workflow, setWorkflow] = useState("default");
  const [metadata, setMetadata] = useState<Metadata>();
  const [inspection, setInspection] = useState<{ metadata: Metadata; selected: DescribedWorkflow }>();
  const [inspecting, setInspecting] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const busy = useRef(false);
  const discovered = metadata?.workflows.find(w => w.name === workflow);
  const selected = inspection?.metadata === metadata && inspection?.selected.name === workflow ? inspection.selected : undefined;
  const projectPath = props.arguments?.project || "";

  useEffect(() => {
    let current = true;
    setLoading(true); setMetadata(undefined); setInspection(undefined); setError(""); setValues({});
    client.list(projectPath)
      .then(result => { if (current) setMetadata(result); })
      .catch(e => { if (current) setError(e.message); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [projectPath]);

  useEffect(() => {
    let current = true;
    setInspection(undefined); setValues({}); setInspecting(false);
    if (!metadata || !discovered) return;
    setInspecting(true);
    client.describe(metadata.project, discovered)
      .then(selected => {
        if (!current) return;
        setValues(Object.fromEntries(selected.args.map(a => [a.name, a.default ?? ""])));
        setInspection({ metadata, selected });
      })
      .catch(e => { if (current) setError(e.message); })
      .finally(() => { if (current) setInspecting(false); });
    return () => { current = false; };
  }, [metadata, discovered]);

  async function submit(formValues: Form.Values) {
    if (busy.current) return;
    if (loading || inspecting) { setError("Wait for workflows to load."); return; }
    if (!metadata) return;
    if (!discovered) { setError(`Workflow '${workflow}' was not found. Choose an available workflow or a project containing it.`); return; }
    if (!selected) { setError(error || "Wait for workflow arguments to load."); return; }
    let args: string[];
    try {
      args = argumentValues(selected.args, Object.fromEntries(selected.args.map(arg => [
        `argument-${arg.position}`, formValues[`argument-${arg.position}`] ?? values[arg.name],
      ])));
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); return; }
    busy.current = true; setRunning(true); setError("");
    try {
      await client.check(metadata.project, selected, args);
      await showToast({ style: Toast.Style.Animated, title: "Starting workflow", message: workflow });
      await client.launch(metadata.project, selected, args);
      await showToast({ style: Toast.Style.Success, title: "Workspace ready", message: workflow });
      await closeMainWindow();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
      await showToast({ style: Toast.Style.Failure, title: "Layouter", message });
    } finally { busy.current = false; setRunning(false); }
  }

  return <Form navigationTitle={projectPath ? `Layouter — ${metadata?.project || projectPath}` : "Layouter — Global workflows"} isLoading={loading || inspecting || running} actions={
    <ActionPanel><Action.SubmitForm title={running ? "Running…" : "Run Workflow"} onSubmit={submit} /></ActionPanel>
  }>
    <Form.Dropdown id="workflow" title="Workflow" value={workflow} filtering autoFocus
      onChange={value => { if (!busy.current) { setWorkflow(value); setError(""); } }}>
      {!metadata?.workflows.some(w => w.name === "default") && <Form.Dropdown.Item value="default" title="default" />}
      {metadata?.workflows.map(w => <Form.Dropdown.Item key={w.name} value={w.name} title={w.name} />)}
    </Form.Dropdown>
    {selected?.description && <Form.Description title="Description" text={selected.description} />}
    {selected?.args.map((arg, index) => arg.choices ?
      <Form.Dropdown key={`${selected.source}:${workflow}:${arg.name}`} id={`argument-${index}`} title={arg.name}
        value={values[arg.name] ?? arg.default ?? ""} filtering info={arg.help}
        onChange={value => setValues(old => ({ ...old, [arg.name]: value }))}>
        {arg.required && !arg.choices.includes("") && <Form.Dropdown.Item value="" title="Choose a value…" />}
        {arg.choices.map(choice => <Form.Dropdown.Item key={choice} value={choice} title={choice || "(empty)"} />)}
      </Form.Dropdown> :
      <Form.TextField key={`${selected.source}:${workflow}:${arg.name}`} id={`argument-${index}`} title={arg.name}
        value={values[arg.name] ?? arg.default ?? ""} placeholder={arg.required ? "Required" : "Optional"}
        info={arg.help} onChange={value => setValues(old => ({ ...old, [arg.name]: value }))} />)}
    {error && <Form.Description title="Error" text={error} />}
  </Form>;
}
