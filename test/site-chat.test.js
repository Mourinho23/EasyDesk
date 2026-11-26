const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const site = path.join(__dirname, "..", "site");

test("website chat streams online AI responses without downloading a model", () => {
  const html = fs.readFileSync(path.join(site, "index.html"), "utf8");
  const script = fs.readFileSync(path.join(site, "chat.js"), "utf8");
  const config = fs.readFileSync(path.join(site, "config.js"), "utf8");
  const tailwind = fs.readFileSync(path.join(site, "tailwind.css"), "utf8");

  assert.match(html, /id="chat-launcher"/);
  assert.match(html, /id="chat-title">EasyDesk AI/);
  assert.match(html, /id="chat-title">EasyDesk AI<\/h2>\s*<span id="chat-mode-status" class="chat-status-dot"/);
  assert.doesNotMatch(html, /IA online · Gemini/);
  assert.doesNotMatch(script, /Gemini · pronta/);
  assert.match(html, /src="\.\/easydesk-icon\.png"/);
  assert.match(html, /href="\.\/tailwind\.css"/);
  assert.doesNotMatch(html, /id="chat-hint"|As respostas são geradas online/);
  assert.match(script, /window\.EASYDESK_AI_ENDPOINT/);
  assert.match(script, /response\.body\.getReader\(\)/);
  assert.match(script, /part\.thought/);
  assert.doesNotMatch(script, /@huggingface\/transformers|Qwen3-|generativelanguage\.googleapis\.com|apiKey/);
  assert.match(config, /EASYDESK_AI_ENDPOINT/);
  assert.match(tailwind, /\.tw-fixed\{position:fixed\}/);
  assert.doesNotThrow(() => new vm.Script(script, { filename: "site/chat.js" }));
});
