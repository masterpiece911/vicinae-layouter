#!/usr/bin/env python3
"""Read workflow metadata through the installed Layouter parser."""
import json
import os
from pathlib import Path
import shutil
import sys


def metadata(project_text, executable):
    sys.path.insert(0, shutil.which(executable) or executable)
    from layouter.config import load, workflow_data, declarations
    project = Path(project_text).expanduser() if project_text else Path.home()
    if not project.is_absolute() or not project.is_dir():
        raise ValueError('Project must be an existing absolute directory (~/ is supported).')
    project = project.resolve()
    global_dir = Path(os.environ.get('XDG_CONFIG_HOME') or Path.home()/'.config')/'layouter'
    paths = {p.stem: p for p in global_dir.glob('*.toml') if p.is_file()}
    if project_text:
        paths.update({p.stem:p for p in (project/'.dev').glob('*.toml') if p.is_file()})
    workflows = []
    for name, path in sorted(paths.items(), key=lambda pair:(pair[0]!='default',pair[0])):
        try:
            config, _ = load(project, workflow=name, force_global=not bool(project_text))
            data = workflow_data(config, name)
            workflows.append(dict(name=name, source=str(path), args=declarations(data)))
        except Exception as error:
            workflows.append(dict(name=name, source=str(path), args=[], error=str(error)))
    return dict(project=str(project), globalOnly=not bool(project_text), workflows=workflows)


if __name__ == '__main__':
    try:
        request=json.load(sys.stdin)
        print(json.dumps(metadata(request.get('project',''),request['executable'])))
    except Exception as error:
        print(str(error),file=sys.stderr)
        sys.exit(2)
