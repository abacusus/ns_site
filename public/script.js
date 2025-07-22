document.getElementById("uploadForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const formData = new FormData(e.target);
  const res = await fetch("/upload", {
    method: "POST",
    body: formData,
  });
  const json = await res.json();
  if (json.success) {
    alert("File uploaded!");
    loadFiles();
  }
});

async function loadFiles() {
  const res = await fetch("/files");
  const files = await res.json();
  const list = document.getElementById("fileList");
  list.innerHTML = "";
  files.forEach(f => {
    const li = document.createElement("li");
    li.innerHTML = `${f.name} - <a href="/files/${f.id}">Download</a>`;
    list.appendChild(li);
  });
}

window.onload = loadFiles;
