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

test("website chat keeps complete turns when sending the recent conversation", async () => {
  const script = fs.readFileSync(path.join(site, "chat.js"), "utf8");
  const elements = new Map();
  const requests = [];

  class MockElement {
    constructor() {
      this.listeners = {};
      this.dataset = {};
      this.style = {};
      this.classList = { add() {}, remove() {} };
      this.children = [];
      this.hidden = true;
      this.disabled = false;
      this.value = "";
      this.scrollHeight = 0;
    }
    addEventListener(type, listener) { this.listeners[type] = listener; }
    append(element) { this.children.push(element); }
    replaceChildren() { this.children = []; }
    remove() {}
    setAttribute() {}
    focus() {}
  }

  const document = {
    activeElement: null,
    body: { classList: { add() {}, remove() {} } },
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, new MockElement());
      return elements.get(id);
    },
    createElement() { return new MockElement(); }
  };
  const encoder = new TextEncoder();

  vm.runInNewContext(script, {
    document,
    window: { EASYDESK_AI_ENDPOINT: "https://example.test/chat" },
    HTMLElement: MockElement,
    TextDecoder,
    fetch: async (_url, options) => {
      requests.push(JSON.parse(options.body));
      const body = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode('data: {"candidates":[{"content":{"parts":[{"text":"ok"}]}}]}\n\n'));
          controller.close();
        }
      });
      return { ok: true, body };
    }
  });

  const form = elements.get("chat-form");
  const input = elements.get("chat-input");
  for (let turn = 0; turn < 7; turn++) {
    input.value = "pergunta " + turn;
    await form.listeners.submit({ preventDefault() {} });
  }

  const messages = requests[6].messages;
  assert.equal(messages.length, 11);
  assert.deepEqual(messages.map(message => message.role), [
    "user", "assistant", "user", "assistant", "user", "assistant",
    "user", "assistant", "user", "assistant", "user"
  ]);
});
