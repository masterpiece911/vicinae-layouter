const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync, realpathSync } = require('node:fs');
const { tmpdir, homedir } = require('node:os');
const { join, resolve } = require('node:path');

const build = mkdtempSync(join(tmpdir(), 'vicinae-client-tests-'));
execFileSync(process.execPath, [require.resolve('typescript/bin/tsc'), 'src/client.ts', '--outDir', build,
  '--target', 'ES2022', '--module', 'commonjs', '--strict', '--skipLibCheck']);
const { createClient, execute, argumentValues, projectDirectory } = require(join(build, 'client.js'));
after(() => rmSync(build, { recursive: true, force: true }));
const record = { name: 'morning', source: '/work path/.dev/morning.tsx', format: 'tsx', description: null, args: null };
const json = fields => JSON.stringify({ schema_version: 1, ...fields });

test('discovery preserves unknown arguments; selected inspection/check/launch pin the source', async () => {
  const calls = [];
  const client = createClient('layouter', async (file, args) => {
    calls.push({ file, args });
    if (args.includes('--list')) return json({ workflows: [record], futureField: true });
    if (args.includes('--describe')) return json({ workflow: { ...record, args: [], description: 'Literal {project}' } });
    return 'Human-readable progress';
  });
  const metadata = await client.list('');
  assert.equal(metadata.workflows[0].args, null);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].args, ['-C', realpathSync(homedir()), '--global', '--list', '--json']);
  const selected = await client.describe(metadata.project, record);
  assert.deepEqual(selected.args, []);
  assert.equal(selected.description, 'Literal {project}');
  const values = ['--flag', '', 'spaces ; $(literal)'];
  await client.check(metadata.project, selected, values);
  await client.launch(metadata.project, selected, values);
  const base = ['-C', metadata.project, '--file', record.source];
  assert.deepEqual(calls.slice(1).map(c => c.args), [
    [...base, '--describe', '--json', 'morning'], [...base, '--check', 'morning', ...values], [...base, 'morning', ...values],
  ]);
});

test('argument values preserve empty strings, defaults, and positional choices', () => {
  const args = [
    { name: 'target', position: 0, required: true },
    { name: 'mode', position: 1, required: false, default: 'dev', choices: ['dev', 'prod', ''] },
    { name: 'extra', position: 2, required: false, default: '' },
  ];
  assert.deepEqual(argumentValues(args, {}), ['', 'dev', '']);
  assert.deepEqual(argumentValues(args, { 'argument-0': '--literal', 'argument-1': '' }), ['--literal', '', '']);
  assert.throws(() => argumentValues(args, { 'argument-1': 'invalid' }), /valid value/);
  assert.throws(() => argumentValues(null, {}), /load/);
});

test('rejects unsupported schemas, malformed metadata, and uninspected descriptions', async () => {
  for (const output of ['no JSON', '{"schema_version":2}', json({ workflows: {} }), json({ workflows: [{ ...record, source: 'relative' }] })]) {
    await assert.rejects(createClient('layouter', async () => output).list(''));
  }
  await assert.rejects(createClient('layouter', async () => json({ workflow: record })).describe('/project', record), /inconsistent/);
  await assert.rejects(createClient('layouter', async () => { throw new Error('Ambiguous workflow'); }).list(''), /Ambiguous workflow/);
});

test('project validation supports home and rejects relative or missing paths', async () => {
  assert.equal(await projectDirectory('~'), realpathSync(homedir()));
  assert.equal(await projectDirectory('~/.'), realpathSync(homedir()));
  await assert.rejects(projectDirectory('relative'), /absolute directory/);
  await assert.rejects(projectDirectory(join(build, 'missing')), /absolute directory/);
});

test('subprocesses preserve literal argv and report nonzero diagnostics before JSON parsing', async () => {
  const values = ['', '--flag', '$(do not execute); spaces'];
  const output = await execute(process.execPath, ['-e', 'process.stdout.write(JSON.stringify(process.argv.slice(1)))', '--', ...values]);
  assert.deepEqual(JSON.parse(output), values);
  await assert.rejects(execute(process.execPath, ['-e', 'console.log("{}"); console.error("Runtime missing"); process.exit(2)']), /Runtime missing/);
  const logs = [];
  const oldError = console.error;
  console.error = message => logs.push(message);
  try {
    assert.equal(await execute(process.execPath, ['-e', 'process.stderr.write("diagnostic"); process.stdout.write("ok")']), 'ok');
    assert.deepEqual(logs, ['diagnostic']);
  } finally { console.error = oldError; }
});

const source = resolve(process.env.LAYOUTER_SOURCE || '../layouter/src');
test('real Layouter CLI: precedence, ambiguity, source pinning, and TSX inspection', {
  skip: !existsSync(join(source, 'layouter/metadata.py')) && 'Set LAYOUTER_SOURCE to a current Layouter source directory',
}, async t => {
  const root = join(build, 'integration');
  const project = join(root, 'project with spaces');
  const global = join(root, 'config/layouter');
  const local = join(project, '.dev');
  mkdirSync(local, { recursive: true }); mkdirSync(global, { recursive: true });
  writeFileSync(join(global, 'default.toml'), 'session="global"\n');
  writeFileSync(join(local, 'default.toml'), 'session="local"\ndescription="Literal {project}"\n[args.target]\nposition=0\nrequired=true\n');
  const marker = join(root, 'imported');
  writeFileSync(join(global, 'react.toml'), 'session="fallback"\n');
  writeFileSync(join(local, 'react.tsx'), `import { defineWorkflow } from '@layouter/react';
import { writeFileSync } from 'node:fs';
writeFileSync(${JSON.stringify(marker)}, 'imported');
export default defineWorkflow({ description: 'React summary', args: { mode: { position: 0, default: 'dev', choices: ['dev', 'prod'] } }, component() { throw new Error('Metadata must not render'); } });`);
  const cli = createClient('unused', (_, args) => execute('env', [`PYTHONPATH=${source}`, `XDG_CONFIG_HOME=${join(root, 'config')}`, 'python3', '-m', 'layouter', ...args]));
  const listed = await cli.list(project);
  assert.deepEqual(listed.workflows.map(w => w.name), ['default', 'react']);
  assert.equal(listed.workflows[0].source, join(local, 'default.toml'));
  assert.equal(listed.workflows[1].args, null);
  assert.equal(existsSync(marker), false);
  const globals = await cli.list('');
  assert.equal(globals.workflows[0].source, join(global, 'default.toml'));
  const toml = await cli.describe(project, listed.workflows[0]);
  assert.equal(toml.args[0].required, true);
  assert.equal(toml.description, 'Literal {project}');
  writeFileSync(join(local, 'default.tsx'), 'throw new Error("must not execute")');
  await assert.rejects(cli.list(project), /Ambiguous workflow/);
  assert.equal((await cli.describe(project, toml)).source, toml.source);
  await cli.check(project, toml, ['']);
  await t.test('TSX imports only the selected module and does not render', {
    skip: !existsSync(join(source, 'layouter/_react_runtime.zip')) && 'Build the Layouter React runtime first',
  }, async () => {
    const react = await cli.describe(project, listed.workflows[1]);
    assert.equal(existsSync(marker), true);
    assert.equal(react.description, 'React summary');
    assert.deepEqual(react.args, [{ name: 'mode', position: 0, required: false, default: 'dev', choices: ['dev', 'prod'] }]);
  });
});
