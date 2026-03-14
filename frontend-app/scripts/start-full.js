const { spawn } = require("child_process");
const path = require("path");

const backendDir = path.resolve(__dirname, "..", "..", "backend");
const frontendDir = path.resolve(__dirname, "..");
const useFrontendHttps =
  process.env.FRONTEND_HTTPS === "1" ||
  process.argv.includes("--https");

const backendCmd = "py";
const backendArgs = ["-m", "uvicorn", "server:app", "--reload", "--port", "8000"];

const frontendCmd = "npm";
const frontendArgs = ["run", useFrontendHttps ? "start:frontend:https" : "start:frontend"];

const runProcess = (cmd, args, cwd, name) => {
  const child = spawn(cmd, args, {
    cwd,
    stdio: "inherit",
    shell: true,
    env: process.env,
  });

  child.on("exit", (code) => {
    console.log(`[${name}] exited with code ${code}`);
  });

  return child;
};

console.log(
  `Starting backend and frontend... (frontend protocol: ${useFrontendHttps ? "HTTPS" : "HTTP"})`
);
const backend = runProcess(backendCmd, backendArgs, backendDir, "backend");
const frontend = runProcess(frontendCmd, frontendArgs, frontendDir, "frontend");

const shutdown = () => {
  if (backend && !backend.killed) backend.kill("SIGINT");
  if (frontend && !frontend.killed) frontend.kill("SIGINT");
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
