#!/usr/bin/env node
// Renders secrets/README.md from secrets/inventory.yaml.
//
//   node scripts/render-secrets.mjs          write secrets/README.md
//   node scripts/render-secrets.mjs --check  exit 1 if README.md is stale or the inventory is invalid
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const inventoryPath = join(repoRoot, "secrets", "inventory.yaml");
const readmePath = join(repoRoot, "secrets", "README.md");

const CATEGORIES = {
  platform: "Platform",
  cloudflare: "Cloudflare",
  openbao: "OpenBao",
  auth: "Authentication and service-to-service",
  runtime: "Runtime",
  database: "Databases",
  storage: "Object storage",
  ci: "CI/CD and GitHub",
  observability: "Observability",
};
const REQUIRED = ["id", "name", "category", "purpose", "consumers", "env", "github", "openbao", "kubernetes", "owner", "rotation", "generate"];
const GITHUB_SCOPES = /^(org|none|env:[a-z-]+)$/;
const OPENBAO_KEY = /^[A-Z][A-Z0-9_]*$/;

function validate(inventory) {
  const errors = [];
  if (inventory?.version !== 1) errors.push("version must be 1");
  if (typeof inventory?.mount !== "string" || inventory.mount === "") errors.push("mount must name the KV v2 mount");
  if (!Array.isArray(inventory?.secrets)) return [...errors, "secrets must be a list"];

  const ids = new Set();
  const githubNames = new Set();
  const bindings = new Set();
  for (const [index, secret] of inventory.secrets.entries()) {
    const where = `secrets[${index}] (${secret?.id ?? "?"})`;
    for (const field of REQUIRED) {
      if (!(field in secret)) errors.push(`${where}: missing ${field}`);
    }
    if (!/^[a-z0-9-]+$/.test(secret.id ?? "")) errors.push(`${where}: id must be kebab-case`);
    if (ids.has(secret.id)) errors.push(`${where}: duplicate id`);
    ids.add(secret.id);
    if (!(secret.category in CATEGORIES)) errors.push(`${where}: unknown category ${secret.category}`);
    if (!GITHUB_SCOPES.test(secret.github?.scope ?? "")) errors.push(`${where}: github.scope must be org, none or env:<name>`);
    const names = secret.github?.names ?? [];
    for (const name of names) {
      if (githubNames.has(name)) errors.push(`${where}: GitHub secret ${name} listed twice`);
      githubNames.add(name);
    }
    if (!Array.isArray(secret.openbao)) {
      errors.push(`${where}: openbao must be a list of bindings ([] when never stored in OpenBao)`);
    } else {
      for (const binding of secret.openbao) {
        const key = `${binding?.path}#${binding?.key}`;
        if (!String(binding?.path ?? "").startsWith("discordy/")) errors.push(`${where}: openbao path ${binding?.path} must start with discordy/ (relative to the ${inventory.mount} mount)`);
        if (!OPENBAO_KEY.test(binding?.key ?? "")) errors.push(`${where}: openbao key ${binding?.key} must be UPPER_SNAKE_CASE`);
        if (bindings.has(key)) errors.push(`${where}: OpenBao ${key} bound twice`);
        bindings.add(key);
        if (!names.includes(binding?.github)) errors.push(`${where}: binding ${key} uses GitHub secret ${binding?.github}, which is not in github.names`);
      }
    }
    if (!secret.rotation?.interval || !secret.rotation?.procedure) errors.push(`${where}: rotation needs interval and procedure`);
    for (const forbidden of ["value", "secret", "password", "token"]) {
      if (forbidden in secret) errors.push(`${where}: field "${forbidden}" is not allowed (no values in the inventory)`);
    }
  }
  return errors;
}

const code = (items) => (items.length ? items.map((item) => `\`${item}\``).join(", ") : "—");
const cell = (text) => String(text).replace(/\|/g, "\\|").replace(/\n/g, " ");
const runbookLink = (procedure) => {
  const [file, anchor] = procedure.split("#");
  return `[${file}${anchor ? `#${anchor}` : ""}](../runbooks/${file}${anchor ? `#${anchor}` : ""})`;
};
const githubCell = ({ scope, names }) => (scope === "none" ? "not in GitHub" : `${code(names)} (${scope})`);
const openbaoCell = (bindings) =>
  bindings.length
    ? bindings.map((b) => `\`${b.path}\` → \`${b.key}\` (from \`${b.github}\`)`).join("; ")
    : "not in OpenBao";
const kubernetesCell = (list) => (list.length ? list.map((k) => `\`${k.namespace}/${k.secret}\``).join(", ") : "—");

function render(inventory) {
  const lines = [
    "# Secrets inventory",
    "",
    "<!-- Generated from inventory.yaml by scripts/render-secrets.mjs. Do not edit by hand. -->",
    "",
    `Every secret on the Discordy platform is listed here. The source is [\`inventory.yaml\`](inventory.yaml). This page records no values: values exist only in GitHub secrets, OpenBao (KV v2 mount \`${inventory.mount}\`), Kubernetes Secrets and 1Password. The OpenBao paths and keys match \`gitops/secrets/inventory.yaml\`, which CI enforces.`,
    "",
    "**Flow** ([ADR-0006](../adr/0006-secrets-flow.md)):",
    "",
    "1. GitHub org or `production` environment secret.",
    "2. The `secrets-sync` workflow, running on the self-hosted runner.",
    "3. OpenBao KV v2 at `kv/discordy/...`.",
    "4. External Secrets Operator.",
    "5. A Kubernetes Secret, injected into pods as env vars.",
    "",
    "**Related runbooks**: [secret rotation](../runbooks/secret-rotation.md) · [OpenBao unseal](../runbooks/openbao-unseal.md)",
    "",
    "## Summary",
    "",
    "| Secret | Category | Consumers | GitHub secret | Rotation |",
    "|---|---|---|---|---|",
  ];
  for (const s of inventory.secrets) {
    lines.push(`| [${cell(s.name)}](#${s.id}) | ${CATEGORIES[s.category]} | ${cell(s.consumers.join(", "))} | ${githubCell(s.github)} | ${s.rotation.interval} |`);
  }

  for (const [category, title] of Object.entries(CATEGORIES)) {
    const secrets = inventory.secrets.filter((s) => s.category === category);
    if (secrets.length === 0) continue;
    lines.push("", `## ${title}`);
    for (const s of secrets) {
      lines.push(
        "",
        `<a id="${s.id}"></a>`,
        "",
        `### ${s.name}`,
        "",
        "| Field | Value |",
        "|---|---|",
        `| Purpose | ${cell(s.purpose)} |`,
        `| Consumers | ${cell(s.consumers.join(", "))} |`,
        `| Env vars | ${code(s.env)} |`,
        `| GitHub secret | ${githubCell(s.github)} |`,
        `| OpenBao | ${openbaoCell(s.openbao)} |`,
        `| Kubernetes Secret | ${kubernetesCell(s.kubernetes)} |`,
        `| Owner | ${cell(s.owner)} |`,
        `| Rotation | ${s.rotation.interval} — ${runbookLink(s.rotation.procedure)} |`,
        `| Generate | ${cell(s.generate)} |`,
      );
      if (s.notes) lines.push(`| Notes | ${cell(s.notes)} |`);
    }
  }
  lines.push(
    "",
    "## Changing the inventory",
    "",
    "1. Edit [`inventory.yaml`](inventory.yaml). Record metadata only, never a value.",
    "2. Run `pnpm secrets:render` and commit both files.",
    "3. Add the value as a GitHub secret with the listed name and scope.",
    "4. Add the `ExternalSecret` mapping in `gitops`.",
    "5. Run the `secrets-sync` workflow.",
    "",
  );
  return lines.join("\n");
}

const inventory = parse(readFileSync(inventoryPath, "utf8"));
const errors = validate(inventory);
if (errors.length) {
  console.error(`inventory.yaml is invalid:\n  - ${errors.join("\n  - ")}`);
  process.exit(1);
}

const output = render(inventory);
if (process.argv.includes("--check")) {
  const current = existsSync(readmePath) ? readFileSync(readmePath, "utf8").replace(/\r\n/g, "\n") : "";
  if (current !== output) {
    console.error("secrets/README.md is out of date. Run `pnpm secrets:render` and commit the result.");
    process.exit(1);
  }
  console.log(`secrets inventory OK (${inventory.secrets.length} secrets)`);
} else {
  writeFileSync(readmePath, output);
  console.log(`rendered secrets/README.md (${inventory.secrets.length} secrets)`);
}
