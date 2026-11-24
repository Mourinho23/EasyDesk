const GEMINI_MODEL = "gemini-3.5-flash-lite";
const GEMINI_URL =
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:streamGenerateContent?alt=sse`;
const MAX_BODY_BYTES = 24 * 1024;
const MAX_MESSAGES = 12;
const MAX_MESSAGE_LENGTH = 2000;
const SYSTEM_INSTRUCTION = [
  "És o assistente EasyDesk AI. Responde em português europeu, tratando a pessoa por tu.",
  "Dá respostas úteis, corretas e diretas, com uma explicação breve quando ajudar.",
  "Se não souberes, diz isso claramente. Não inventes informação.",
  "Podes explicar o EasyDesk, mas não afirmes que tens acesso ao computador da pessoa."
].join(" ");

function corsHeaders(origin, env) {
  const allowedOrigins = (env.ALLOWED_ORIGINS || "")
    .split(",")
    .map(value => value.trim())
    .filter(Boolean);
  if (!allowedOrigins.includes(origin)) return null;

  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Cache-Control": "no-store",
    Vary: "Origin"
  };
}

function jsonResponse(status, error, headers = {}) {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...headers
    }
  });
}

function validateMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES) {
    return false;
  }

  return messages.every(message =>
    message &&
    (message.role === "user" || message.role === "assistant") &&
    typeof message.content === "string" &&
    message.content.trim().length > 0 &&
    message.content.length <= MAX_MESSAGE_LENGTH
  );
}

async function readLimitedBody(request, maxBytes) {
  const reader = request.body?.getReader();
  if (!reader) return { text: "", tooLarge: false };

  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        return { text: "", tooLarge: true };
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { text: new TextDecoder().decode(bytes), tooLarge: false };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const headers = corsHeaders(origin, env);
    if (!headers) {
      return jsonResponse(403, "Este site não está autorizado a usar o serviço de IA.");
    }

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers });
    }

    const url = new URL(request.url);
    if (url.pathname !== "/chat" || request.method !== "POST") {
      return jsonResponse(404, "Endereço não encontrado.", headers);
    }

    if (!env.GEMINI_API_KEY) {
      return jsonResponse(503, "O serviço de IA ainda não está configurado.", headers);
    }
    if (!env.AI_RATE_LIMITER) {
      return jsonResponse(503, "O limite de utilização do serviço não está configurado.", headers);
    }
    if (!request.headers.get("Content-Type")?.toLowerCase().includes("application/json")) {
      return jsonResponse(415, "O pedido tem de estar em formato JSON.", headers);
    }

    const clientIp = request.headers.get("CF-Connecting-IP");
    if (!clientIp) {
      return jsonResponse(400, "Não foi possível validar o pedido.", headers);
    }

    const { success } = await env.AI_RATE_LIMITER.limit({ key: clientIp });
    if (!success) {
      return jsonResponse(429, "Atingiste o limite temporário de perguntas. Tenta novamente mais tarde.", headers);
    }

    const contentLength = Number(request.headers.get("Content-Length"));
    if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
      return jsonResponse(413, "A conversa é demasiado longa. Começa uma conversa nova.", headers);
    }

    const { text: body, tooLarge } = await readLimitedBody(request, MAX_BODY_BYTES);
    if (tooLarge) {
      return jsonResponse(413, "A conversa é demasiado longa. Começa uma conversa nova.", headers);
    }

    let payload;
    try {
      payload = JSON.parse(body);
    } catch {
      return jsonResponse(400, "O pedido não contém JSON válido.", headers);
    }

    if (!validateMessages(payload.messages)) {
      return jsonResponse(400, "A conversa não tem um formato válido ou é demasiado longa.", headers);
    }

    const geminiRequest = {
      systemInstruction: {
        parts: [{ text: SYSTEM_INSTRUCTION }]
      },
      contents: payload.messages.map(message => ({
        role: message.role === "assistant" ? "model" : "user",
        parts: [{ text: message.content }]
      })),
      generationConfig: {
        maxOutputTokens: 768,
        temperature: 0.6
      }
    };

    let geminiResponse;
    try {
      geminiResponse = await fetch(GEMINI_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": env.GEMINI_API_KEY
        },
        body: JSON.stringify(geminiRequest),
        signal: request.signal
      });
    } catch (error) {
      if (request.signal.aborted) throw error;
      console.error("Não foi possível ligar à API Gemini:", error.message);
      return jsonResponse(502, "Não foi possível ligar à IA. Tenta novamente.", headers);
    }

    if (!geminiResponse.ok) {
      const errorBody = await geminiResponse.text();
      console.error("A API Gemini respondeu com erro:", geminiResponse.status, errorBody.slice(0, 1000));
      if (geminiResponse.status === 429) {
        return jsonResponse(429, "A quota gratuita da IA está temporariamente esgotada. Tenta mais tarde.", headers);
      }
      if (geminiResponse.status === 401 || geminiResponse.status === 403) {
        return jsonResponse(503, "A chave da IA online não está válida ou não tem acesso ao modelo.", headers);
      }
      return jsonResponse(502, "A IA está temporariamente indisponível. Tenta novamente.", headers);
    }

    return new Response(geminiResponse.body, {
      status: 200,
      headers: {
        ...headers,
        "Content-Type": "text/event-stream; charset=utf-8",
        "X-Accel-Buffering": "no"
      }
    });
  }
};
