document.addEventListener("DOMContentLoaded", async () => {
  try {
    const response = await fetch("/api/containers");
    if (!response.ok) throw new Error("Network error");
    const containers = await response.json();
    renderContainers(containers);
  } catch (error) {
    console.error("Error:", error);
    document.getElementById(
      "container-list"
    ).innerHTML = `<div class="error">Ошибка загрузки данных: ${error.message}</div>`;
  }
});

function renderContainers(containers) {
  const container = document.getElementById("container-list");
  container.innerHTML = containers
    .map(
      (container) => `
    <div class="container-card">
      <div class="image-container">
        ${
          container.photo
            ? `<img src="${container.photo}" alt="${container.type}" loading="lazy" 
            onerror="this.onerror=null;this.src='/placeholder.jpg'">`
            : '<div class="image-placeholder">Нет фото</div>'
        }
      </div>
      <div class="info-container">
        <h3>${container.type} ${container.number}</h3>
        <p><strong>Город:</strong> ${container.city}</p>
        <p><strong>Поставщик:</strong> ${container.supplier}</p>
        <p><strong>Терминал:</strong> ${container.terminal}</p>
        <p class="price">${container.price} руб.</p>
      </div>
    </div>
  `
    )
    .join("");
}
