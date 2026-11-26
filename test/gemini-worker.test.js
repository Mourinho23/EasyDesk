const assert = require("node:assert/strict");
const test = require("node:test");

let worker;
test.before(async () => {
  worker = (await import("../worker/src/index.mjs")).default;
});

const allowedOrigin = "https://mourinho23.github.io";

function createEnvironment(overrides = {}) {
  return {
    ALLOWED_ORIGINS: allowedOrigin,
    GEMINI_API_KEY: "test-secret",
    AI_RATE_LIMITER: {
      limit: async () => ({ success: true })
    },
    ...overrides
  };
}

function createChatRequest(messages, headers = {}) {
  return createRawChatRequest(JSON.stringify({ messages }), headers);
}

function createRawChatRequest(body, headers = {}) {
  return new Request("https://easydesk-ai.example.workers.dev/chat", {
    method: "POST",
    headers: {
      Origin: allowedOrigin,
      "CF-Connecting-IP": "192.0.2.1",
      "Content-Type": "application/json",
      ...headers
    },
    body
  });
}

test("Worker handles CORS preflight only for the configured site", async () => {
  const response = await worker.fetch(
    new Request("https://easydesk-ai.example.workers.dev/chat", {
      method: "OPTIONS",
      headers: { Origin: allowedOrigin }
    }),
    createEnvironment()
  );

  assert.equal(response.status, 204);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), allowedOrigin);
});

test("Worker rejects requests from other origins", async () => {
  const response = await worker.fetch(
    createChatRequest([{ role: "user", content: "Olá" }], {
      Origin: "https://attacker.example"
    }),
    createEnvironment()
  );

  assert.equal(response.status, 403);
});

test("Worker rejects valid JSON without a conversation object", async () => {
  for (const body of ["null", "42", "[]"]) {
    const response = await worker.fetch(
      createRawChatRequest(body),
      createEnvironment()
    );

    assert.equal(response.status, 400);
  }
});

test("Worker validates conversation size and rate limits before calling Gemini", async t => {
  const originalFetch = globalThis.fetch;
  let upstreamCalled = false;
  globalThis.fetch = async () => {
    upstreamCalled = true;
    return new Response("");
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const tooManyMessages = Array.from({ length: 13 }, () => ({
    role: "user",
    content: "Olá"
  }));
  const invalidResponse = await worker.fetch(
    createChatRequest(tooManyMessages),
    createEnvironment()
  );
  assert.equal(invalidResponse.status, 400);

  const limitedResponse = await worker.fetch(
    createChatRequest([{ role: "user", content: "Olá" }]),
    createEnvironment({
      AI_RATE_LIMITER: { limit: async () => ({ success: false }) }
    })
  );
  assert.equal(limitedResponse.status, 429);
  assert.equal(upstreamCalled, false);
});

test("Worker rejects an oversized request body without forwarding it", async t => {
  const originalFetch = globalThis.fetch;
  let upstreamCalled = false;
  globalThis.fetch = async () => {
    upstreamCalled = true;
    return new Response("");
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const response = await worker.fetch(
    createChatRequest([{ role: "user", content: "x".repeat(25 * 1024) }]),
    createEnvironment()
  );

  assert.equal(response.status, 413);
  assert.equal(upstreamCalled, false);
});

test("Worker keeps the Gemini key server-side and streams the model response", async t => {
  const originalFetch = globalThis.fetch;
  let upstreamUrl;
  let upstreamOptions;
  globalThis.fetch = async (url, options) => {
    upstreamUrl = String(url);
    upstreamOptions = options;
    return new Response('data: {"candidates":[{"content":{"parts":[{"text":"Olá"}]}}]}\n\n', {
      headers: { "Content-Type": "text/event-stream" }
    });
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const response = await worker.fetch(
    createChatRequest([{ role: "user", content: "Olá" }]),
    createEnvironment()
  );

  assert.equal(response.status, 200);
  assert.match(response.headers.get("Content-Type"), /text\/event-stream/);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), allowedOrigin);
  assert.equal(upstreamOptions.headers["x-goog-api-key"], "test-secret");
  assert.doesNotMatch(upstreamUrl, /test-secret/);
  assert.match(upstreamUrl, /gemini-3\.5-flash-lite:streamGenerateContent/);
  assert.match(await response.text(), /Olá/);
});
