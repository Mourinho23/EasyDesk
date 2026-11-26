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
  const welcomeText = "Olá! Sou o EasyDesk AI. Escreve a tua pergunta.";
  const apiEndpoint = window.EASYDESK_AI_ENDPOINT;

  let history = [];
  let returnFocus;

  function setStatus(status, label) {
    modeStatus.dataset.status = status;
    modeStatus.setAttribute("aria-label", label);
  }

  function addMessage(role, text, extraClass = "") {
    const message = document.createElement("p");
    message.className = `chat-message ${role === "user" ? "user" : "assistant"} ${extraClass}`.trim();
    message.textContent = text;
    messagesElement.append(message);
    messagesElement.scrollTop = messagesElement.scrollHeight;
    return message;
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

  function mostrarErroApi(responseStatus, message) {
    if (responseStatus === 429) {
      return message || "A quota gratuita ou o limite temporário foi atingido. Tenta novamente mais tarde.";
    }
    return message || "Não foi possível ligar à IA online. Tenta novamente.";
  }

  async function lerRespostaStreaming(response, onText) {
    if (!response.body) {
      throw new Error("O navegador não conseguiu iniciar a resposta da IA.");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let answer = "";

    function processarEvento(evento) {
      const data = evento
        .split(/\r?\n/)
        .filter(line => line.startsWith("data:"))
        .map(line => line.slice(5).trim())
        .join("\n");
      if (!data || data === "[DONE]") return;

      let chunk;
      try {
        chunk = JSON.parse(data);
      } catch {
        throw new Error("A IA devolveu uma resposta num formato inválido.");
      }

      if (chunk.error?.message) {
        throw new Error(chunk.error.message);
      }
      const parts = chunk.candidates?.[0]?.content?.parts || [];
      for (const part of parts) {
        if (part.thought || typeof part.text !== "string" || !part.text) continue;
        answer += part.text;
        onText(part.text);
      }
    }

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split(/\r?\n\r?\n/);
        buffer = events.pop();
        for (const event of events) processarEvento(event);
      }
      buffer += decoder.decode();
      if (buffer.trim()) processarEvento(buffer);
    } finally {
      reader.releaseLock();
    }

    if (!answer.trim()) {
      throw new Error("A IA terminou sem produzir uma resposta. Tenta novamente.");
    }
    return answer.trim();
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

    errorElement.hidden = true;
    errorElement.textContent = "";
    addMessage("user", question);
    input.value = "";
    input.style.height = "auto";
    input.disabled = true;
    sendButton.disabled = true;

    const pending = addMessage("assistant", "A ligar à IA online...", "pending");
    let answerElement;

    try {
      if (!apiEndpoint) {
        throw new Error("O serviço online ainda não está configurado.");
      }

      setStatus("busy", "IA a pensar e a responder");
      const response = await fetch(apiEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            ...history.slice(-10),
            { role: "user", content: question }
          ]
        })
      });

      if (!response.ok) {
        let errorMessage;
        try {
          errorMessage = (await response.json()).error;
        } catch {
          errorMessage = null;
        }
        throw new Error(mostrarErroApi(response.status, errorMessage));
      }

      const answer = await lerRespostaStreaming(response, text => {
        if (!answerElement) {
          pending.remove();
          answerElement = addMessage("assistant", "");
        }
        answerElement.textContent += text;
        messagesElement.scrollTop = messagesElement.scrollHeight;
      });
      if (answerElement) answerElement.textContent = answer;
      else {
        pending.remove();
        addMessage("assistant", answer);
      }

      history.push(
        { role: "user", content: question },
        { role: "assistant", content: answer }
      );
      history = history.slice(-12);
      setStatus("ready", "IA operacional");
    } catch (error) {
      pending.remove();
      setStatus("unavailable", "IA indisponível");
      errorElement.textContent = error?.message || "Não foi possível obter uma resposta. Tenta novamente.";
      errorElement.hidden = false;
    } finally {
      input.disabled = false;
      sendButton.disabled = false;
      if (!overlay.hidden) input.focus();
    }
  });

  setStatus(apiEndpoint ? "ready" : "unconfigured", apiEndpoint ? "IA operacional" : "IA por configurar");
  resetConversation();
})();
