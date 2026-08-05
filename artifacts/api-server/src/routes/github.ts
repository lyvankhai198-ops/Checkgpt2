import { Router } from "express";
import { githubProxy } from "../lib/github.js";

const router = Router();

// GET /api/github/user — thông tin user hiện tại
router.get("/github/user", async (req, res) => {
  try {
    const data = await githubProxy("/user");
    res.json(data);
  } catch (err) {
    req.log.error(err, "github /user error");
    res.status(500).json({ error: "Không thể lấy thông tin user GitHub" });
  }
});

// GET /api/github/repos — danh sách repo của user
router.get("/github/repos", async (req, res) => {
  try {
    const data = await githubProxy("/user/repos?sort=updated&per_page=50");
    res.json(data);
  } catch (err) {
    req.log.error(err, "github /user/repos error");
    res.status(500).json({ error: "Không thể lấy danh sách repo" });
  }
});

// GET /api/github/repos/:owner/:repo — chi tiết một repo
router.get("/github/repos/:owner/:repo", async (req, res) => {
  try {
    const { owner, repo } = req.params;
    const data = await githubProxy(`/repos/${owner}/${repo}`);
    res.json(data);
  } catch (err) {
    req.log.error(err, "github repo detail error");
    res.status(500).json({ error: "Không thể lấy thông tin repo" });
  }
});

// GET /api/github/repos/:owner/:repo/issues — issues của repo
router.get("/github/repos/:owner/:repo/issues", async (req, res) => {
  try {
    const { owner, repo } = req.params;
    const data = await githubProxy(`/repos/${owner}/${repo}/issues?state=open`);
    res.json(data);
  } catch (err) {
    req.log.error(err, "github issues error");
    res.status(500).json({ error: "Không thể lấy issues" });
  }
});

// GET /api/github/repos/:owner/:repo/pulls — pull requests của repo
router.get("/github/repos/:owner/:repo/pulls", async (req, res) => {
  try {
    const { owner, repo } = req.params;
    const data = await githubProxy(`/repos/${owner}/${repo}/pulls?state=open`);
    res.json(data);
  } catch (err) {
    req.log.error(err, "github pulls error");
    res.status(500).json({ error: "Không thể lấy pull requests" });
  }
});

export default router;
