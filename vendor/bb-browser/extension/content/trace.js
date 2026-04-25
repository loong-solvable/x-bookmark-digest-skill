let isRecording = false;
function getXPath(element) {
  if (element.id) {
    return `//*[@id="${element.id}"]`;
  }
  if (element === document.body) {
    return "/html/body";
  }
  let index = 1;
  const siblings = element.parentNode?.children;
  if (siblings) {
    for (let i = 0; i < siblings.length; i++) {
      const sibling = siblings[i];
      if (sibling === element) {
        const parentPath = element.parentElement ? getXPath(element.parentElement) : "";
        return `${parentPath}/${element.tagName.toLowerCase()}[${index}]`;
      }
      if (sibling.nodeType === 1 && sibling.tagName === element.tagName) {
        index++;
      }
    }
  }
  return element.tagName.toLowerCase();
}
function getHighlightIndex(element) {
  let current = element;
  while (current) {
    const attr = current.getAttribute("data-highlight-index");
    if (attr !== null) {
      const index = parseInt(attr, 10);
      if (!isNaN(index)) {
        return index;
      }
    }
    current = current.parentElement;
  }
  return void 0;
}
function extractSemanticInfo(element) {
  const tag = element.tagName.toLowerCase();
  let role = element.getAttribute("role") || "";
  if (!role) {
    switch (tag) {
      case "button":
        role = "button";
        break;
      case "a":
        role = "link";
        break;
      case "input": {
        const type = element.type;
        switch (type) {
          case "text":
          case "email":
          case "password":
          case "search":
          case "tel":
          case "url":
            role = "textbox";
            break;
          case "checkbox":
            role = "checkbox";
            break;
          case "radio":
            role = "radio";
            break;
          case "submit":
          case "button":
            role = "button";
            break;
          default:
            role = "textbox";
        }
        break;
      }
      case "textarea":
        role = "textbox";
        break;
      case "select":
        role = "combobox";
        break;
      case "img":
        role = "img";
        break;
      default:
        role = tag;
    }
  }
  let name = "";
  name = element.getAttribute("aria-label") || "";
  if (!name) {
    const labelledBy = element.getAttribute("aria-labelledby");
    if (labelledBy) {
      const labelElement = document.getElementById(labelledBy);
      if (labelElement) {
        name = labelElement.textContent?.trim() || "";
      }
    }
  }
  if (!name) {
    if (element.id) {
      const label = document.querySelector(`label[for="${element.id}"]`);
      if (label) {
        name = label.textContent?.trim() || "";
      }
    }
  }
  if (!name) {
    name = element.getAttribute("title") || element.getAttribute("alt") || element.placeholder || element.textContent?.trim().slice(0, 50) || "";
  }
  return { role, name, tag };
}
function getCssSelector(element) {
  const parts = [];
  let current = element;
  while (current && current !== document.body) {
    let selector = current.tagName.toLowerCase();
    if (current.id) {
      selector = `#${current.id}`;
      parts.unshift(selector);
      break;
    }
    if (current.className) {
      const classes = current.className.split(/\s+/).filter((c) => c && /^[a-zA-Z_]/.test(c));
      if (classes.length > 0) {
        selector += "." + classes.slice(0, 2).join(".");
      }
    }
    parts.unshift(selector);
    current = current.parentElement;
  }
  return parts.join(" > ");
}
function handleClick(event) {
  if (!isRecording) return;
  const target = event.target;
  if (!target) return;
  const semanticInfo = extractSemanticInfo(target);
  const inputType = target.type?.toLowerCase();
  const isCheckbox = target.tagName.toLowerCase() === "input" && inputType === "checkbox";
  const traceEvent = {
    type: isCheckbox ? "check" : "click",
    timestamp: Date.now(),
    url: window.location.href,
    ref: getHighlightIndex(target),
    xpath: getXPath(target),
    cssSelector: getCssSelector(target),
    elementRole: semanticInfo.role,
    elementName: semanticInfo.name,
    elementTag: semanticInfo.tag,
    // 如果是 checkbox，记录状态
    checked: isCheckbox ? target.checked : void 0
  };
  console.log("[Trace] Click event:", traceEvent);
  chrome.runtime.sendMessage({ type: "TRACE_EVENT", payload: traceEvent });
}
let inputDebounceTimer = null;
let lastInputElement = null;
let lastInputValue = "";
function handleInput(event) {
  if (!isRecording) return;
  const target = event.target;
  if (!target || !("value" in target)) return;
  if (inputDebounceTimer) {
    clearTimeout(inputDebounceTimer);
  }
  lastInputElement = target;
  lastInputValue = target.value;
  inputDebounceTimer = setTimeout(() => {
    if (!lastInputElement) return;
    const semanticInfo = extractSemanticInfo(lastInputElement);
    const isPassword = lastInputElement.type === "password";
    const traceEvent = {
      type: "fill",
      timestamp: Date.now(),
      url: window.location.href,
      ref: getHighlightIndex(lastInputElement),
      xpath: getXPath(lastInputElement),
      cssSelector: getCssSelector(lastInputElement),
      value: isPassword ? "********" : lastInputValue,
      elementRole: semanticInfo.role,
      elementName: semanticInfo.name,
      elementTag: semanticInfo.tag
    };
    console.log("[Trace] Input event:", traceEvent);
    chrome.runtime.sendMessage({ type: "TRACE_EVENT", payload: traceEvent });
    inputDebounceTimer = null;
    lastInputElement = null;
    lastInputValue = "";
  }, 500);
}
function handleChange(event) {
  if (!isRecording) return;
  const target = event.target;
  if (!target || target.tagName !== "SELECT") return;
  const semanticInfo = extractSemanticInfo(target);
  const selectedOption = target.options[target.selectedIndex];
  const traceEvent = {
    type: "select",
    timestamp: Date.now(),
    url: window.location.href,
    ref: getHighlightIndex(target),
    xpath: getXPath(target),
    cssSelector: getCssSelector(target),
    value: selectedOption?.text || target.value,
    elementRole: semanticInfo.role,
    elementName: semanticInfo.name,
    elementTag: semanticInfo.tag
  };
  console.log("[Trace] Select event:", traceEvent);
  chrome.runtime.sendMessage({ type: "TRACE_EVENT", payload: traceEvent });
}
const CAPTURED_KEYS = /* @__PURE__ */ new Set([
  "Enter",
  "Tab",
  "Escape",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Home",
  "End",
  "PageUp",
  "PageDown",
  "Backspace",
  "Delete"
]);
function handleKeydown(event) {
  if (!isRecording) return;
  const key = event.key;
  let keyToLog = "";
  if (CAPTURED_KEYS.has(key)) {
    keyToLog = key;
  } else if ((event.ctrlKey || event.metaKey) && key.length === 1 && /[a-zA-Z0-9]/.test(key)) {
    const modifier = event.metaKey ? "Meta" : "Control";
    keyToLog = `${modifier}+${key.toLowerCase()}`;
  }
  if (!keyToLog) return;
  const target = event.target;
  const semanticInfo = target ? extractSemanticInfo(target) : { role: "", name: "", tag: "document" };
  const traceEvent = {
    type: "press",
    timestamp: Date.now(),
    url: window.location.href,
    ref: target ? getHighlightIndex(target) : void 0,
    xpath: target ? getXPath(target) : void 0,
    cssSelector: target ? getCssSelector(target) : void 0,
    key: keyToLog,
    elementRole: semanticInfo.role,
    elementName: semanticInfo.name,
    elementTag: semanticInfo.tag
  };
  console.log("[Trace] Keydown event:", traceEvent);
  chrome.runtime.sendMessage({ type: "TRACE_EVENT", payload: traceEvent });
}
let scrollDebounceTimer = null;
let scrollStartY = 0;
function handleScroll() {
  if (!isRecording) return;
  if (!scrollDebounceTimer) {
    scrollStartY = window.scrollY;
  } else {
    clearTimeout(scrollDebounceTimer);
  }
  scrollDebounceTimer = setTimeout(() => {
    const scrollEndY = window.scrollY;
    const deltaY = scrollEndY - scrollStartY;
    if (Math.abs(deltaY) < 50) {
      scrollDebounceTimer = null;
      return;
    }
    const direction = deltaY > 0 ? "down" : "up";
    const pixels = Math.abs(deltaY);
    const traceEvent = {
      type: "scroll",
      timestamp: Date.now(),
      url: window.location.href,
      direction,
      pixels
    };
    console.log("[Trace] Scroll event:", traceEvent);
    chrome.runtime.sendMessage({ type: "TRACE_EVENT", payload: traceEvent });
    scrollDebounceTimer = null;
  }, 300);
}
function startRecording() {
  if (isRecording) return;
  console.log("[Trace] Starting recording on:", window.location.href);
  isRecording = true;
  document.addEventListener("click", handleClick, true);
  document.addEventListener("input", handleInput, true);
  document.addEventListener("change", handleChange, true);
  document.addEventListener("keydown", handleKeydown, true);
  window.addEventListener("scroll", handleScroll, { passive: true });
}
function stopRecording() {
  if (!isRecording) return;
  console.log("[Trace] Stopping recording on:", window.location.href);
  isRecording = false;
  document.removeEventListener("click", handleClick, true);
  document.removeEventListener("input", handleInput, true);
  document.removeEventListener("change", handleChange, true);
  document.removeEventListener("keydown", handleKeydown, true);
  window.removeEventListener("scroll", handleScroll);
  if (inputDebounceTimer) {
    clearTimeout(inputDebounceTimer);
    inputDebounceTimer = null;
  }
  if (scrollDebounceTimer) {
    clearTimeout(scrollDebounceTimer);
    scrollDebounceTimer = null;
  }
}
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "TRACE_START") {
    startRecording();
    sendResponse({ success: true });
  } else if (message.type === "TRACE_STOP") {
    stopRecording();
    sendResponse({ success: true });
  } else if (message.type === "TRACE_STATUS") {
    sendResponse({ recording: isRecording });
  }
  return true;
});
chrome.runtime.sendMessage({ type: "GET_TRACE_STATUS" }, (response) => {
  if (chrome.runtime.lastError) {
    console.log("[Trace] Error getting initial status:", chrome.runtime.lastError.message);
    return;
  }
  if (response?.recording) {
    startRecording();
  }
});
window.addEventListener("beforeunload", () => {
  stopRecording();
});
console.log("[Trace] Content script loaded on:", window.location.href);
//# sourceMappingURL=trace.js.map
