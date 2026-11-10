const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const site = path.join(__dirname, "..", "site");

test("website chat runs a local AI model without requesting an API key", () => {
  const html = fs.readFileSync(path.join(site, "index.html"), "utf8");
  const script = fs.readFileSync(path.join(site, "chat.js"), "utf8");
  const tailwind = fs.readFileSync(path.join(site, "tailwind.css"), "utf8");

  assert.match(html, /id="chat-launcher"/);
  assert.match(html, /id="chat-title">EasyDesk AI/);
  assert.match(html, /src="\.\/easydesk-icon\.png"/);
  assert.match(html, /href="\.\/tailwind\.css"/);
  assert.match(html, /IA a correr no teu navegador, sem chave/);
  assert.doesNotMatch(html, /chat-api-key|Gemini|chave da API/i);
  assert.match(script, /onnx-community\/Qwen3-1\.7B-ONNX/);
  assert.match(script, /temperature: 0\.7/);
  assert.match(script, /top_p: 0\.8/);
  assert.match(script, /@huggingface\/transformers/);
  assert.doesNotMatch(script, /generativelanguage\.googleapis\.com|apiKey|demoReply/);
  assert.match(tailwind, /\.tw-fixed\{position:fixed\}/);
  assert.doesNotThrow(() => new vm.Script(script, { filename: "site/chat.js" }));
});
