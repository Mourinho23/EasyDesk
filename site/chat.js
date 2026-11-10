(() => {
  const launcher = document.getElementById("chat-launcher");
  const overlay = document.getElementById("chat-overlay");
  const dialog = document.getElementById("chat-dialog");
  const closeButton = document.getElementById("chat-close");
  const minimizeButton = document.getElementById("chat-minimize");
  const form = document.getElementById("chat-form");
  const input = document.getElementById("chat-input");
  const sendButton = document.getElementById("chat-send");
  const messagesElement = document.getElementById("chat-messages");
  const errorElement = document.getElementById("chat-error");
  const modeStatus = document.getElementById("chat-mode-status");
  const welcomeText = "Olá! Sou o EasyDesk AI. Escreve a tua pergunta — não precisas de chave nem de conta.";
  const modelId = "onnx-community/Qwen3-1.7B-ONNX";
  const transformersUrl = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.2";

  let generatorPromise;
  let generator;
  let history = [];
  let returnFocus;
  let activeRequest = 0;

  function addMessage(role, text, extraClass = "") {
    const message = document.createElement("p");
    message.className = `chat-message ${role === "user" ? "user" : "assistant"} ${extraClass}`.trim();
    message.textContent = text;
    messagesElement.append(message);
    messagesElement.scrollTop = messagesElement.scrollHeight;
    return message;
  }

  function setStatus(text) {
    modeStatus.textContent = text;
  }

  function resetConversation() {
    history = [];
    messagesElement.replaceChildren();
    addMessage("assistant", welcomeText);
    errorElement.hidden = true;
    errorElement.textContent = "";
  }

  function openChat() {
    returnFocus = document.activeElement;
    overlay.hidden = false;
    dialog.setAttribute("aria-hidden", "false");
    document.body.classList.add("chat-open");
    input.focus();
  }

  function hideChat() {
    overlay.hidden = true;
    dialog.setAttribute("aria-hidden", "true");
    document.body.classList.remove("chat-open");
    if (returnFocus instanceof HTMLElement) returnFocus.focus();
  }

  async function createGenerator(device, onProgress) {
    const { pipeline } = await import(transformersUrl);
    const options = {
      dtype: device === "webgpu" ? "q4f16" : "q4",
      progress_callback: onProgress
    };
    if (device === "webgpu") options.device = "webgpu";
    return pipeline("text-generation", modelId, options);
  }

  async function getGenerator(onProgress, requestId) {
    if (generator) return generator;
    if (!generatorPromise) {
      generatorPromise = (async () => {
        let adapter = null;
        if (navigator.gpu?.requestAdapter) {
          try {
            adapter = await navigator.gpu.requestAdapter();
          } catch {
            adapter = null;
          }
        }

        const device = adapter ? "webgpu" : "wasm";
        setStatus(adapter ? "IA local · modo gráfico" : "IA local · modo compatível");
        try {
          return await createGenerator(device, onProgress);
        } catch (error) {
          if (!adapter || !/webgpu|gpu|adapter|device|execution provider/i.test(error.message)) {
            throw error;
          }
          setStatus("A tentar modo compatível...");
          if (requestId === activeRequest) {
            const pending = messagesElement.querySelector(".chat-message.pending");
            if (pending) pending.textContent = "A preparar a IA para este dispositivo...";
          }
          return createGenerator("wasm", onProgress);
        }
      })()
        .then(instance => {
          generator = instance;
          setStatus("IA local · pronta");
          return instance;
        })
        .catch(error => {
          generatorPromise = null;
          setStatus("IA local · erro ao carregar");
          throw error;
        });
    }
    return generatorPromise;
  }

  async function generateReply(question, onProgress, requestId) {
    const model = await getGenerator(onProgress, requestId);
    setStatus("IA local · a responder");

    const messages = [
      {
        role: "system",
        content: "És um assistente de IA útil e conversacional. Responde diretamente ao que a pessoa perguntou, usando o contexto das mensagens anteriores quando for relevante. Se a pergunta for ambígua, faz uma pergunta curta para esclarecer; não mudes de assunto nem dês uma resposta genérica. Dá explicações corretas e práticas, com passos quando forem úteis. Se não souberes ou não tiveres informação suficiente, diz isso claramente em vez de inventar. Responde sempre em português europeu, tratando a pessoa por tu; usa «computador» e «ficheiro», nunca «você», «celular» ou «usuário». Podes responder sobre assuntos gerais e explicar o EasyDesk, mas não afirmes que tens acesso ao computador da pessoa. Mantém as respostas claras e adequadas à pergunta."
      },
      ...history,
      { role: "user", content: question }
    ];
    const result = await model(messages, {
      max_new_tokens: 320,
      do_sample: true,
      temperature: 0.7,
      top_p: 0.8,
      top_k: 20,
      repetition_penalty: 1.05,
      tokenizer_encode_kwargs: { enable_thinking: false }
    });

    const generated = result?.[0]?.generated_text;
    const rawAnswer = Array.isArray(generated)
      ? generated.at(-1)?.content
      : generated;
    if (typeof rawAnswer !== "string" || !rawAnswer.trim()) {
      throw new Error("A IA não conseguiu gerar uma resposta. Tenta reformular a pergunta.");
    }
    const answer = rawAnswer
      .replace(/<think>[\s\S]*?<\/think>/gi, "")
      .replace(/<think>[\s\S]*$/i, "")
      .trim();
    if (!answer) {
      throw new Error("A IA não concluiu uma resposta. Tenta novamente.");
    }
    return answer;
  }

  launcher.addEventListener("click", openChat);
  closeButton.addEventListener("click", hideChat);
  minimizeButton.addEventListener("click", hideChat);
  overlay.addEventListener("click", event => {
    if (event.target === overlay) hideChat();
  });

  dialog.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      event.preventDefault();
      hideChat();
      return;
    }
    if (event.key !== "Tab") return;

    const focusable = Array.from(dialog.querySelectorAll(
      'button:not(:disabled), textarea:not(:disabled)'
    ));
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  input.addEventListener("keydown", event => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      form.requestSubmit();
    }
  });
  input.addEventListener("input", () => {
    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, 110)}px`;
  });

  form.addEventListener("submit", async event => {
    event.preventDefault();
    const question = input.value.trim();
    if (!question || sendButton.disabled) return;

    const requestId = ++activeRequest;
    errorElement.hidden = true;
    errorElement.textContent = "";
    addMessage("user", question);
    input.value = "";
    input.style.height = "auto";
    input.disabled = true;
    sendButton.disabled = true;

    const pending = document.createElement("p");
    pending.className = "chat-message assistant pending";
    pending.setAttribute("aria-label", "A preparar resposta");
    pending.innerHTML = '<span class="chat-typing" aria-hidden="true"><i></i><i></i><i></i></span>';
    messagesElement.append(pending);
    messagesElement.scrollTop = messagesElement.scrollHeight;

    const onProgress = progress => {
      if (requestId !== activeRequest || progress.status !== "progress") return;
      const percent = Number.isFinite(progress.progress)
        ? ` · ${Math.round(progress.progress)}%`
        : "";
      const file = String(progress.file || "").split(/[\\/]/).pop();
      pending.textContent = file
        ? `A descarregar a IA (${file}${percent})... Só é necessário na primeira utilização.`
        : "A descarregar o modelo de IA...";
      messagesElement.scrollTop = messagesElement.scrollHeight;
    };

    try {
      const answer = await generateReply(question, onProgress, requestId);
      pending.remove();
      addMessage("assistant", answer);
      history.push(
        { role: "user", content: question },
        { role: "assistant", content: answer }
      );
      history = history.slice(-12);
      setStatus("IA local · pronta");
    } catch (error) {
      pending.remove();
      setStatus("IA local · não disponível");
      const errorMessage = typeof error?.message === "string" ? error.message : "";
      errorElement.textContent = /fetch|network|download|load failed/i.test(errorMessage)
        ? "Não foi possível descarregar a IA. Verifica a ligação à Internet e tenta novamente."
        : errorMessage || "Não foi possível iniciar a IA. Tenta novamente.";
      errorElement.hidden = false;
    } finally {
      input.disabled = false;
      sendButton.disabled = false;
      if (!overlay.hidden) input.focus();
    }
  });

  resetConversation();
})();
