const STORAGE_KEY = "upstreamUrl";
const DEFAULT_URL = "http://localhost:19824";
const urlInput = document.getElementById("url");
const saveBtn = document.getElementById("save");
const statusDiv = document.getElementById("status");
chrome.storage.sync.get(STORAGE_KEY, (result) => {
  urlInput.value = result[STORAGE_KEY] || "";
  urlInput.placeholder = DEFAULT_URL;
});
saveBtn.addEventListener("click", async () => {
  const url = urlInput.value.trim();
  await chrome.storage.sync.set({ [STORAGE_KEY]: url });
  statusDiv.textContent = `Saved. ${url ? `Using: ${url}` : `Using default: ${DEFAULT_URL}`}`;
  statusDiv.className = "status saved";
  setTimeout(() => {
    statusDiv.textContent = "";
  }, 3e3);
});
//# sourceMappingURL=options.js.map
