(function () {
  "use strict";

  function initPetsgatesChat() {
    var root = document.querySelector("[data-ai-chat]");
    if (!root || root.dataset.bound === "1") return;
    root.dataset.bound = "1";

    var launcher = root.querySelector("[data-chat-launcher]");
    var panel = root.querySelector("[data-chat-panel]");
    var closeButton = root.querySelector("[data-chat-close]");
    var messages = root.querySelector("[data-chat-messages]");
    var prompts = root.querySelector("[data-chat-prompts]");
    var form = root.querySelector("[data-chat-form]");
    var input = root.querySelector("[data-chat-input]");
    var sendButton = root.querySelector("[data-chat-send]");
    var honeypot = root.querySelector("[data-chat-honeypot]");
    var contactLink = root.querySelector("[data-chat-contact]");
    if (!launcher || !panel || !closeButton || !messages || !form || !input || !sendButton) return;

    var apiBase = (root.dataset.chatApi || "api").replace(/\/$/, "");
    var state = {
      open: false,
      busy: false,
      csrf: "",
      history: [],
      lastFocus: null
    };

    function scrollToLatest() {
      window.requestAnimationFrame(function () {
        messages.scrollTop = messages.scrollHeight;
      });
    }

    function setOpen(open) {
      state.open = open;
      root.classList.toggle("is-open", open);
      launcher.setAttribute("aria-expanded", String(open));
      panel.setAttribute("aria-hidden", String(!open));

      if (open) {
        state.lastFocus = document.activeElement;
        window.setTimeout(function () {
          input.focus();
          scrollToLatest();
        }, 260);
      } else if (state.lastFocus && typeof state.lastFocus.focus === "function") {
        state.lastFocus.focus();
      }
    }

    function appendInlineText(container, text) {
      var fragments = String(text).split("**");
      fragments.forEach(function (fragment, index) {
        if (!fragment) return;
        if (index % 2 === 1) {
          var strong = document.createElement("strong");
          strong.textContent = fragment;
          container.appendChild(strong);
        } else {
          container.appendChild(document.createTextNode(fragment));
        }
      });
    }

    function renderSafeText(container, text) {
      container.textContent = "";
      var lines = String(text).replace(/\r/g, "").split("\n");
      var list = null;

      lines.forEach(function (line) {
        var trimmed = line.trim();
        var listMatch = trimmed.match(/^[-•*]\s+(.+)/);
        if (listMatch) {
          if (!list) {
            list = document.createElement("ul");
            container.appendChild(list);
          }
          var item = document.createElement("li");
          appendInlineText(item, listMatch[1]);
          list.appendChild(item);
          return;
        }

        list = null;
        if (trimmed === "") return;
        var paragraph = document.createElement("p");
        appendInlineText(paragraph, trimmed);
        container.appendChild(paragraph);
      });

      if (!container.children.length) {
        var fallback = document.createElement("p");
        fallback.textContent = text;
        container.appendChild(fallback);
      }
    }

    function createMessage(role, text, options) {
      var wrapper = document.createElement("div");
      wrapper.className = "pg-chat-message pg-chat-message-" + role;
      if (options && options.emergency) wrapper.classList.add("is-emergency");

      var label = document.createElement("span");
      label.className = "pg-chat-message-label";
      label.textContent = role === "user" ? "Vos" : "Petsy · Gemini";

      var bubble = document.createElement("div");
      bubble.className = "pg-chat-bubble";
      if (options && options.typing) {
        var typing = document.createElement("span");
        typing.className = "pg-chat-typing";
        typing.setAttribute("aria-label", "Pensando");
        typing.innerHTML = "<i></i><i></i><i></i>";
        bubble.appendChild(typing);
      } else {
        renderSafeText(bubble, text);
      }

      wrapper.appendChild(label);
      wrapper.appendChild(bubble);
      messages.appendChild(wrapper);
      scrollToLatest();
      return { wrapper: wrapper, bubble: bubble };
    }

    function setBusy(busy) {
      state.busy = busy;
      input.disabled = busy;
      sendButton.disabled = busy;
      form.classList.toggle("is-busy", busy);
    }

    function resizeInput() {
      input.style.height = "auto";
      input.style.height = Math.min(input.scrollHeight, 112) + "px";
    }

    async function getSession(force) {
      if (state.csrf && !force) return state.csrf;
      var response = await fetch(apiBase + "/session.php", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: "{}"
      });

      var payload;
      try {
        payload = await response.json();
      } catch (error) {
        throw new Error("Petsy todavía no puede conectarse con Gemini en esta vista previa.");
      }

      if (!response.ok || !payload.csrf) {
        throw new Error(payload.message || "No pudimos iniciar una sesión segura.");
      }
      state.csrf = payload.csrf;
      return state.csrf;
    }

    function parseSseBlock(block) {
      var eventName = "message";
      var dataLines = [];
      block.split("\n").forEach(function (line) {
        if (line.indexOf("event:") === 0) eventName = line.slice(6).trim();
        if (line.indexOf("data:") === 0) dataLines.push(line.slice(5).trim());
      });
      if (!dataLines.length) return null;
      try {
        return { event: eventName, data: JSON.parse(dataLines.join("\n")) };
      } catch (error) {
        return null;
      }
    }

    async function readStream(response, target) {
      if (!response.body || !response.body.getReader) {
        throw new Error("Tu navegador no admite respuestas en tiempo real.");
      }

      var reader = response.body.getReader();
      var decoder = new TextDecoder("utf-8");
      var buffer = "";
      var completeText = "";
      var emergency = false;

      while (true) {
        var result = await reader.read();
        buffer += decoder.decode(result.value || new Uint8Array(), { stream: !result.done }).replace(/\r\n/g, "\n");

        var separator;
        while ((separator = buffer.indexOf("\n\n")) !== -1) {
          var block = buffer.slice(0, separator);
          buffer = buffer.slice(separator + 2);
          var parsed = parseSseBlock(block);
          if (!parsed) continue;

          if (parsed.event === "delta" && parsed.data.text) {
            completeText += parsed.data.text;
            target.bubble.textContent = completeText;
            scrollToLatest();
          } else if (parsed.event === "meta" && parsed.data.emergency) {
            emergency = true;
            target.wrapper.classList.add("is-emergency");
          } else if (parsed.event === "error") {
            throw new Error(parsed.data.message || "No pudimos obtener una respuesta.");
          }
        }

        if (result.done) break;
      }

      if (!completeText.trim()) throw new Error("Petsy no pudo generar una respuesta.");
      renderSafeText(target.bubble, completeText);
      return { text: completeText, emergency: emergency };
    }

    async function requestAnswer(message, target, retried) {
      var csrf = await getSession(false);
      var response = await fetch(apiBase + "/chat.php", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "Accept": "text/event-stream",
          "X-Petsgates-CSRF": csrf
        },
        body: JSON.stringify({
          message: message,
          history: state.history.slice(-8),
          website: honeypot ? honeypot.value : ""
        })
      });

      if (!response.ok) {
        var errorPayload = {};
        try { errorPayload = await response.json(); } catch (error) { errorPayload = {}; }
        if (response.status === 401 && !retried) {
          state.csrf = "";
          await getSession(true);
          return requestAnswer(message, target, true);
        }
        var error = new Error(errorPayload.message || "No pudimos procesar la consulta.");
        error.retryAfter = errorPayload.retryAfter || 0;
        throw error;
      }

      return readStream(response, target);
    }

    async function submitMessage(rawMessage) {
      var message = String(rawMessage || "").trim();
      if (!message || state.busy) return;

      if (message.length > 2000) {
        createMessage("assistant", "Tu mensaje es demasiado largo. Resumilo en menos de 2.000 caracteres.");
        return;
      }

      setBusy(true);
      createMessage("user", message);
      input.value = "";
      resizeInput();
      if (prompts) prompts.hidden = true;

      var target = createMessage("assistant", "", { typing: true });
      try {
        var answer = await requestAnswer(message, target, false);
        state.history.push({ role: "user", text: message });
        state.history.push({ role: "model", text: answer.text });
        state.history = state.history.slice(-8);
      } catch (error) {
        target.wrapper.classList.add("is-emergency");
        renderSafeText(target.bubble, error.message || "No pudimos conectar con el asistente. Intentá nuevamente.");
      } finally {
        setBusy(false);
        input.focus();
        scrollToLatest();
      }
    }

    launcher.addEventListener("click", function () { setOpen(true); });
    closeButton.addEventListener("click", function () { setOpen(false); });

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      submitMessage(input.value);
    });

    input.addEventListener("input", resizeInput);
    input.addEventListener("keydown", function (event) {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        submitMessage(input.value);
      }
    });

    if (prompts) {
      prompts.addEventListener("click", function (event) {
        var button = event.target.closest("[data-chat-prompt]");
        if (!button) return;
        submitMessage(button.dataset.chatPrompt || button.textContent);
      });
    }

    if (contactLink) {
      contactLink.addEventListener("click", function () {
        setOpen(false);
      });
    }

    document.addEventListener("keydown", function (event) {
      if (!state.open) return;
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        return;
      }
      if (event.key !== "Tab") return;

      var focusables = Array.prototype.slice.call(panel.querySelectorAll('a[href], button:not([disabled]), textarea:not([disabled])'))
        .filter(function (element) { return element.offsetParent !== null; });
      if (!focusables.length) return;
      var first = focusables[0];
      var last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initPetsgatesChat, { once: true });
  } else {
    initPetsgatesChat();
  }
})();
