# Layouter for Vicinae

The top-level **Layouter** entry accepts an optional **Project directory** text
argument. Type an absolute path or `~/projects/my-app`, then press Enter. Leave
it empty for global workflows, using the home directory for execution. A project
adds its `.dev/*.toml` workflows, with local precedence over global fallbacks.
Paths are passed literally; no shell expansion other than `~` is performed.

The form contains only:

- **Workflow:** searchable dropdown, initially `default`.
- **Arguments:** named fields from the selected workflow. Defaults are prefilled;
  `choices` become searchable dropdowns; other arguments accept literal text.

The project is displayed in the navigation title. Return to the launcher to
change it. There is no directory picker or project scan. Changing workflows
resets argument fields to their declared defaults. Enter validates and runs;
errors remain in the form. Invalid project paths are reported without opening a
dialog. A missing `default.toml` is not silently replaced by another workflow.

The extension uses Python 3.11+ and the installed Layouter parser to discover
metadata. Install the zipapp in `~/.local/bin/layouter` (preferred) or on PATH.
Vicinae must run inside the i3/Sway session.

## Build and install

From the project root, install dependencies with `pnpm install --ignore-scripts`,
then run `pnpm build`. Vicinae's SDK builds into its extension directory by
default; `pnpm exec vici build -o ./dist` produces a local bundle instead.
The SDK is pinned to Vicinae 0.28.2. Restart Vicinae after installing if the new
extension is not indexed automatically.

The former Layouter script commands are removed. Installed copies are archived
outside Vicinae's scripts directory during migration.

## Tests

Run `python3 -m unittest discover -s tests -v`. Tests use the sibling
`../layouter/src` checkout by default; set `LAYOUTER_SOURCE` to use another
Layouter source directory. Run `pnpm exec tsc --noEmit` to check TypeScript.
