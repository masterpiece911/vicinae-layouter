# Layouter for Vicinae

The top-level **Layouter** entry accepts an optional **Project directory** text
argument. Type an absolute path or `~/projects/my-app`, then press Enter. Leave
it empty for global workflows, using the home directory for execution. A project
adds its `.dev/` TOML and React/TSX workflows, with local precedence over global
fallbacks, including across formats. Paths are passed literally; no shell
expansion other than `~` is performed.

In Vicinae's Layouter extension preferences, enable **Allow relative project
paths** to also accept arguments such as `projects/my-app` or `./my-app`.
**Relative path base directory** defaults to your home directory (`HOME`);
set it to an existing absolute directory or `~/projects` to start elsewhere.
An empty base also uses `HOME`. The base is only used for relative arguments
while the setting is enabled (disabled by default). Absolute paths, `~/…`, and
an empty project argument keep their existing behavior. `..` resolves normally
and may refer to a directory outside the base.

The form contains:

- **Workflow:** searchable dropdown, initially `default`.
- **Description:** the selected workflow's literal summary, when provided.
- **Arguments:** named fields from the selected workflow. Defaults are prefilled;
  `choices` become searchable dropdowns; other arguments accept literal text.

The project is displayed in the navigation title. Return to the launcher to
change it. There is no directory picker or project scan. Changing workflows
loads their metadata and resets argument fields to their declared defaults.
Enter validates and runs; errors remain in the form. Invalid project paths are
reported without opening a dialog. A missing `default` workflow is not silently
replaced by another workflow. Empty strings are passed as values, and Layouter
performs final validation.

## Layouter requirements and integration

Install a current Layouter executable supporting the **version 1 JSON metadata
API** in `~/.local/bin/layouter` (preferred) or on PATH. Older versions without
`--list --json` and `--describe --json` must be updated. Vicinae must run inside
the i3/Sway session. React/TSX workflows additionally require Node.js 22+ and a
Layouter build containing its React runtime.

The extension follows [Layouter's integration guidance](https://github.com/masterpiece911/layouter/blob/main/docs/integrations.md):

- Discover with `--list --json`, using `--global` when no project is supplied.
  Discovery does not execute TSX modules. Layouter owns precedence and ambiguity
  errors, including same-name TOML and TSX files in one scope.
- Inspect only the selected workflow with `--describe --json`. Selecting TSX
  (including the initial `default`) imports its module to read arguments and
  description, without rendering or desktop access. Use trusted workflows.
- Keep the canonical project directory and discovered absolute `--file` source
  consistent for inspection, `--check`, and launch. Switching away and back
  reloads argument metadata; reopen the command to refresh discovery.
- Check `schema_version`, preserve positional string values, and display CLI
  failures. Successful stderr diagnostics are retained in extension logs.

The extension invokes Layouter directly with argument arrays. It does not parse
workflow files, import Layouter's Python internals, or require a separate Python
metadata bridge. Validation uses `--check` before launch; for TSX this imports
and renders the selected workflow again.

## Build and install

From the project root, install dependencies with `pnpm install --ignore-scripts`,
then run `pnpm build`. Vicinae's SDK builds into its extension directory by
default; `pnpm exec vici build -o ./dist` produces a local bundle instead.
The SDK is pinned to Vicinae 0.28.2. Restart Vicinae after installing if the new
extension is not indexed automatically.

## Tests

Run `pnpm test` (or `node --test tests/*.test.cjs`) and
`pnpm exec tsc --noEmit`. Tests use Node's built-in test runner and compile the
CLI client into a temporary directory. CLI integration tests use the sibling
`../layouter/src` checkout by default; set `LAYOUTER_SOURCE` to use another
Layouter source directory. They skip explicitly if that checkout is unavailable;
TSX inspection also requires its built React runtime. Tests do not launch or
change the desktop.
