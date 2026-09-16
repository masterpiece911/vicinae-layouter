import importlib.util
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
LAYOUTER_SOURCE = Path(os.environ.get('LAYOUTER_SOURCE', str(ROOT.parent/'layouter/src')))
spec = importlib.util.spec_from_file_location('vicinae_metadata', ROOT/'assets/workflows.py')
metadata = importlib.util.module_from_spec(spec)
spec.loader.exec_module(metadata)

class MetadataTests(unittest.TestCase):
    def test_global_default_and_project_override(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            global_dir=root/'config/layouter'
            local=root/'project/.dev'
            global_dir.mkdir(parents=True);local.mkdir(parents=True)
            (global_dir/'default.toml').write_text('session="global"\n[args.target]\nposition=0\nchoices=["a","b"]\ndefault="a"\n')
            (global_dir/'other.toml').write_text('session="other"\n')
            (local/'default.toml').write_text('session="local"\n[args.branch]\nposition=0\nrequired=true\n')
            with patch.dict(os.environ, {'XDG_CONFIG_HOME':str(root/'config')}):
                global_result=metadata.metadata('',str(LAYOUTER_SOURCE))
                result=metadata.metadata(str(local.parent),str(LAYOUTER_SOURCE))
            self.assertTrue(global_result['globalOnly'])
            self.assertEqual(global_result['workflows'][0]['args'][0]['default'],'a')
            self.assertEqual(global_result['workflows'][0]['args'][0]['choices'],['a','b'])
            self.assertFalse(result['globalOnly'])
            self.assertEqual(result['project'],str(local.parent))
            self.assertEqual([w['name'] for w in result['workflows']],['default','other'])
            self.assertEqual(result['workflows'][0]['args'],[{'name':'branch'}])
            self.assertEqual(result['workflows'][0]['source'],str(local/'default.toml'))

    def test_bad_workflow_does_not_hide_good_workflow(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);(root/'layouter').mkdir()
            (root/'layouter/bad.toml').write_text('bad = [')
            (root/'layouter/good.toml').write_text('session="good"\n')
            with patch.dict(os.environ,{'XDG_CONFIG_HOME':str(root)}):
                result=metadata.metadata('',str(LAYOUTER_SOURCE))
            self.assertIn('error',result['workflows'][0])
            self.assertNotIn('error',result['workflows'][1])

    def test_missing_project_rejected(self):
        with self.assertRaisesRegex(ValueError,'existing absolute directory'):
            metadata.metadata('/nonexistent/layouter-project',str(LAYOUTER_SOURCE))
