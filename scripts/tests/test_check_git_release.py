import importlib.util
from pathlib import Path
import subprocess
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("check_git_release", Path(__file__).resolve().parents[1] / "check_git_release.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class ReleaseAuditTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.git("init", "-q")
        self.git("config", "user.email", "audit@example.invalid")
        self.git("config", "user.name", "Audit test")
        self.git("config", "commit.gpgsign", "false")
        (self.root / "source.txt").write_text("original\n")
        (self.root / ".gitignore").write_text("runtime/\n")
        self.git("add", ".")
        self.git("commit", "-qm", "baseline")

    def git(self, *args):
        return subprocess.check_output(["git", "-C", str(self.root), *args])

    def test_clean_repository_and_ignored_runtime(self):
        (self.root / "runtime").mkdir()
        (self.root / "runtime/data.txt").write_text("preserve me")
        (self.root / "empty-source-directory").mkdir()
        self.assertTrue(module.audit(self.root, "HEAD")["clean"])

    def test_raw_content_detects_change_hidden_from_git_status(self):
        self.git("update-index", "--assume-unchanged", "source.txt")
        (self.root / "source.txt").write_text("changed\n")
        self.assertEqual(self.git("status", "--porcelain"), b"")
        result = module.audit(self.root, "HEAD")
        self.assertEqual(result["mismatched"], ["source.txt"])
        self.assertFalse(result["clean"])

    def test_missing_and_untracked_files(self):
        (self.root / "source.txt").unlink()
        (self.root / "unexpected.py").write_text("pass\n")
        result = module.audit(self.root, "HEAD")
        self.assertEqual(result["missing"], ["source.txt"])
        self.assertEqual(result["untracked"], ["unexpected.py"])

    def test_stale_index_is_not_a_clean_deployment(self):
        self.git("rm", "--cached", "source.txt")
        result = module.audit(self.root, "HEAD")
        self.assertEqual(result["mismatched"], [])
        self.assertFalse(result["index_matches"])
        self.assertFalse(result["clean"])

    def test_executable_mode_is_verified(self):
        (self.root / "source.txt").chmod(0o755)
        self.assertEqual(module.audit(self.root, "HEAD")["mismatched"], ["source.txt"])

    def test_symlink_is_verified_without_reading_target(self):
        (self.root / "link").symlink_to("source.txt")
        self.git("add", "link")
        self.git("commit", "-qm", "link")
        self.assertTrue(module.audit(self.root, "HEAD")["clean"])
        (self.root / "link").unlink()
        (self.root / "link").symlink_to("missing-target")
        self.assertEqual(module.audit(self.root, "HEAD")["mismatched"], ["link"])


if __name__ == "__main__":
    unittest.main()
