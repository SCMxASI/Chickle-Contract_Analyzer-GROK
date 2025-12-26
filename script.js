/* =========================
   DOM REFERENCES
========================= */
const container = document.querySelector(".container");
const chatsContainer = document.querySelector(".chats-container");
const promptForm = document.querySelector(".prompt-form");
const promptInput = promptForm.querySelector(".prompt-input");
const fileInput = promptForm.querySelector("#file-input");
const fileUploadWrapper = promptForm.querySelector(".file-upload-wrapper");
const themeToggleBtn = document.querySelector("#theme-toggle-btn");
const navbar = document.querySelector(".navbar");
const promptActions = document.querySelector(".prompt-actions");
const wrapper = document.getElementById("main-wrapper");

/* =========================
   STATE
========================= */
let controller = null;
let stopTyping = false;
let hasShrunk = false;
let scrollLocked = true;

const chatHistory = [];
const userData = { message: "", file: {} };

/* =========================
   SCROLL TO BOTTOM BUTTON
========================= */
const scrollBtn = document.createElement("button");
scrollBtn.id = "scroll-to-bottom-btn";
scrollBtn.type = "button";
scrollBtn.className = "material-symbols-rounded";
scrollBtn.textContent = "arrow_downward";

if (promptActions) promptActions.appendChild(scrollBtn);

Object.assign(scrollBtn.style, {
  position: "absolute",
  bottom: "calc(100% + 10px)",
  right: "20px",
  width: "45px",
  height: "45px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: "1.4rem",
  borderRadius: "50%",
  cursor: "pointer",
  opacity: "0",
  pointerEvents: "none",
  transition: "opacity .3s ease, transform .3s ease",
  backgroundColor: "var(--secondary-color)",
  color: "var(--text-color)",
  boxShadow: "0 2px 10px rgba(0,0,0,.2)"
});

const toggleScrollBtn = show => {
  scrollBtn.style.opacity = show ? "1" : "0";
  scrollBtn.style.pointerEvents = show ? "auto" : "none";
  scrollBtn.style.transform = show ? "translateY(0)" : "translateY(5px)";
};

scrollBtn.onclick = () =>
  chatsContainer.scrollTo({ top: chatsContainer.scrollHeight, behavior: "smooth" });

/* =========================
   HELPERS
========================= */
const scrollToBottom = () => {
  if (!chatsContainer) return;
  chatsContainer.scrollTo({
    top: chatsContainer.scrollHeight,
    behavior: "smooth"  // change to "auto" for instant scroll
  });
};


const createMessage = (html, ...cls) => {
  const div = document.createElement("div");
  div.classList.add("message", ...cls);
  div.innerHTML = html;
  return div;
};

const cleanLLMResponse = txt =>
  txt
    .replace(/^(AI|Bot):\s*/i, "")                     // remove bot prefix
    .replace(/As an AI language model.*?(\n|\. )/i, "") // remove boilerplate
    .split("\n")                                       // split lines
    .map(line => line.trim())                          // remove leading/trailing spaces per line
    .filter(line => line.length > 0)                  // remove empty lines
    .join("\n");                                      // join lines back


    
const typingEffect = (text, el, wrapper) => new Promise(resolve => {
  let i = 0;
  let buffer = "";
  const md = window.markdownit({ breaks: true, linkify: true });

  const typeChar = () => {
    if (i < text.length && !stopTyping) {
      buffer += text[i++];

      // normalize consecutive newlines
      const normalizedBuffer = buffer.replace(/\n{2,}/g, "\n");

      // render full markdown
      let rendered = md.render(normalizedBuffer);

      // ===== INLINE TRANSFORM =====
      // paragraphs → <span> + <br>
      rendered = rendered.replace(/<p>(.*?)<\/p>/g, "$1<br>");

      // headers → inline bold + optional class
      rendered = rendered.replace(/<h1>(.*?)<\/h1>/g, "<strong class='subheader-1'>$1</strong><br>");
      rendered = rendered.replace(/<h2>(.*?)<\/h2>/g, "<strong class='subheader-2'>$1</strong><br>");
      rendered = rendered.replace(/<h3>(.*?)<\/h3>/g, "<strong class='subheader-3'>$1</strong><br>");
      rendered = rendered.replace(/<h[4-6]>(.*?)<\/h[4-6]>/g, "<strong class='subheader-small'>$1</strong><br>");

      // list items → inline bullet
      rendered = rendered.replace(/<li>(.*?)<\/li>/g, "• $1<br>");

      // remove extra <br> consecutives
      rendered = rendered.replace(/(<br>\s*){2,}/g, "<br>");

      // remove all remaining margins from markdown tags
      rendered = rendered.replace(/<ul>|<\/ul>|<ol>|<\/ol>/g, "");

      el.innerHTML = rendered;

      scrollToBottom();
      setTimeout(typeChar, 1);
    } else {
  wrapper.classList.remove("loading");
  document.body.classList.remove("bot-responding");

  // ADD END-OF-RESPONSE LINE
  const endLine = document.createElement("div");
  endLine.className = "end-of-response";
  endLine.textContent = "—— End of response ——. Ask me anything else!";
  el.appendChild(endLine);

  scrollToBottom();
  resolve();
}

  };

  typeChar();
});




  

/* =========================
   CHAT SCROLL HANDLING
========================= */
chatsContainer.addEventListener("scroll", () => {
  const nearBottom =
    chatsContainer.scrollHeight - chatsContainer.scrollTop <=
    chatsContainer.clientHeight + 40;

  scrollLocked = nearBottom;
  toggleScrollBtn(!nearBottom && chatsContainer.scrollHeight > chatsContainer.clientHeight);
});

/* =========================
   BACKEND CALL
========================= */
async function generateResponse(botDiv) {
  const textEl = botDiv.querySelector(".message-text");

  if (controller) controller.abort();
  controller = new AbortController();

  try {
    let response;

    if (userData.file.data) {
      const formData = new FormData();
      formData.append("query", userData.message);

      const bytes = Uint8Array.from(atob(userData.file.data), c => c.charCodeAt(0));
      formData.append("file", new Blob([bytes], { type: userData.file.mime_type }), userData.file.fileName);

      response = await fetch("https://chickle-backend-contract-analysis.onrender.com/ask", {
        method: "POST",
        body: formData,
        signal: controller.signal
      });
    } else {
      response = await fetch("https://chickle-backend-contract-analysis.onrender.com/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: userData.message }),
        signal: controller.signal
      });
    }

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Backend error");

    const cleanText = cleanLLMResponse(data.response);
    await typingEffect(cleanText, textEl, botDiv);
  } catch (err) {
    textEl.textContent =
      err.name === "AbortError"
        ? "❌ Response stopped."
        : "❌ Failed to generate response.";
    textEl.style.color = "#d62939";
    botDiv.classList.remove("loading");
  } finally {
    userData.file = {};
  }
}

/* =========================
   FORM SUBMIT
========================= */
promptForm.addEventListener("submit", async e => {
  e.preventDefault();
  stopTyping = false;

  if (!hasShrunk) {
    navbar.classList.add("shrink");
    hasShrunk = true;
  }

  const msg = promptInput.value.trim();
  if (!msg || document.body.classList.contains("bot-responding")) return;

  userData.message = msg;
  promptInput.value = "";
  document.body.classList.add("bot-responding", "chats-active");

  const userHTML = `<p class="message-text"></p>`;
  const userDiv = createMessage(userHTML, "user-message");
  userDiv.querySelector(".message-text").textContent = msg;
  chatsContainer.appendChild(userDiv);
  scrollToBottom(true);

  setTimeout(async () => {
    const botDiv = createMessage(
      `<img class="avatar" src="img/Main image ai.png" />
       <p class="message-text md-root">Just a sec...</p>`,
      "bot-message",
      "loading"
    );
    chatsContainer.appendChild(botDiv);
    scrollToBottom(true);
    await generateResponse(botDiv);
  }, 60);
});

/* =========================
   FILE HANDLING
========================= */
fileInput.onchange = () => {
  const file = fileInput.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = e => {
    userData.file = {
      fileName: file.name,
      data: e.target.result.split(",")[1],
      mime_type: file.type,
      isImage: file.type.startsWith("image/")
    };

    fileUploadWrapper.classList.add("active");
  };
  reader.readAsDataURL(file);
};

document.querySelector("#cancel-file-btn").onclick = () => {
  userData.file = {};
  fileUploadWrapper.className = "file-upload-wrapper";
};

/* =========================
   STOP RESPONSE
========================= */
document.querySelector("#stop-response-btn").onclick = () => {
  // Abort backend request
  if (controller) {
    controller.abort();
    controller = null;
  }

  // Stop typing animation
  stopTyping = true;

  // Restore UI state
  document.body.classList.remove("bot-responding");

  // Remove loading state safely
  const loadingBot = chatsContainer.querySelector(".bot-message.loading");
  if (loadingBot) {
    loadingBot.classList.remove("loading");

    const textEl = loadingBot.querySelector(".message-text");
    if (textEl) {
      textEl.textContent = "❌ Response stopped.";
      textEl.style.color = "#d62939";
    }
  }

  // Restore scroll behavior
  scrollLocked = false;

  // Show scroll-to-bottom button if needed
  if (
    chatsContainer.scrollHeight > chatsContainer.clientHeight &&
    typeof toggleScrollBtn === "function"
  ) {
    toggleScrollBtn(true);
  }
  if (
    chatsContainer.scrollHeight > chatsContainer.clientHeight &&
    typeof toggleScrollButtonVisibility === "function"
  ) {
    toggleScrollButtonVisibility(true);
  }
};


/* =========================
   THEME
========================= */
const isLight = localStorage.getItem("themeColor") === "light_mode";
document.body.classList.toggle("light-theme", isLight);
themeToggleBtn.textContent = isLight ? "dark_mode" : "light_mode";

themeToggleBtn.onclick = () => {
  const light = document.body.classList.toggle("light-theme");
  localStorage.setItem("themeColor", light ? "light_mode" : "dark_mode");
  themeToggleBtn.textContent = light ? "dark_mode" : "light_mode";
};

/* =========================
   FIX: SUGGESTION BOXES
========================= */
document.querySelectorAll(".suggestions-item").forEach(suggestion => {
  suggestion.addEventListener("click", () => {
    // HARD RESET file UI state (this was missing)
    userData.file = {};
    fileUploadWrapper.classList.remove(
      "active",
      "img-attached",
      "file-attached"
    );

    promptInput.value = suggestion.querySelector(".text").textContent;
    promptForm.dispatchEvent(new Event("submit"));
  });
});

/* =========================
   FIX: FILE UPLOAD TRIGGERS
========================= */
document.querySelector("#add-file-btn").onclick = () => {
  fileInput.click();
};

document.querySelector(".file-icon").onclick = () => {
  fileInput.click();
};

/* =========================
   FILE HANDLING (RESTORED EXACTLY)
========================= */
fileInput.addEventListener("change", () => {
  const file = fileInput.files[0];
  if (!file) return;

  const isImage = file.type.startsWith("image/");
  const reader = new FileReader();

  reader.onload = e => {
    const base64String = e.target.result.split(",")[1];

    // restore preview behavior
    const preview = fileUploadWrapper.querySelector(".file-preview");
    if (preview) preview.src = e.target.result;

    // restore exact UI state logic
    fileUploadWrapper.classList.add(
      "active",
      isImage ? "img-attached" : "file-attached"
    );

    userData.file = {
      fileName: file.name,
      data: base64String,
      mime_type: file.type,
      isImage
    };

    // allow re-upload of same file
    fileInput.value = "";
  };

  reader.readAsDataURL(file);
});

/* ADD / FILE ICON BUTTONS */
document.querySelector("#add-file-btn").onclick = () => fileInput.click();
document.querySelector(".file-icon").onclick = () => fileInput.click();

/* CANCEL FILE — FULL RESET */
document.querySelector("#cancel-file-btn").onclick = () => {
  userData.file = {};
  fileUploadWrapper.classList.remove(
    "active",
    "img-attached",
    "file-attached"
  );
};

document.querySelector("#delete-chats-btn").addEventListener("click", () => {
  // Clear messages
  chatsContainer.innerHTML = "";
  chatHistory.length = 0;

  // Reset UI state
  document.body.classList.remove("chats-active", "bot-responding");
  navbar.classList.remove("shrink");
  hasShrunk = false;
  stopTyping = false;
  scrollLocked = true;

  // Hide scroll button
  if (typeof toggleScrollBtn === "function") {
    toggleScrollBtn(false);
  }
  if (typeof toggleScrollButtonVisibility === "function") {
    toggleScrollButtonVisibility(false);
  }

  // Reset file state
  userData.file = {};
  fileUploadWrapper.className = "file-upload-wrapper";

  // 🔥 RESTORE SUGGESTIONS (THIS WAS MISSING)
  document.querySelector(".suggestions")?.classList.remove("hide");

  // 🔥 REPLAY CHICKLE CORPS ANIMATION
  wrapper.classList.add("animate-slide");
  setTimeout(() => wrapper.classList.remove("animate-slide"), 600);
});

// Clean every line from extra spaces
const normalized = response
  .split('\n')
  .map(line => line.trim())  // trim both start and end
  .filter(line => line.length > 0) // remove empty lines
  .join('\n');
chat.textContent = normalized;

/* =========================
   INIT
========================= */
window.addEventListener("DOMContentLoaded", () => {
  wrapper.classList.add("animate-slide");
  document.body.classList.add("fade-in-bottom");
  setTimeout(() => wrapper.classList.remove("animate-slide"), 600);
});

