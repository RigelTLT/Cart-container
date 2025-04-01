document.addEventListener("DOMContentLoaded", () => {
  // Конфигурация
  const config = {
    apiEndpoint: "/api/containers",
    itemsPerPage: 12,
  };

  // Состояние
  const state = {
    currentPage: 1,
    totalPages: 1,
  };

  // Элементы DOM
  const elements = {
    containerList: document.getElementById("container-list"),
    pagination: document.getElementById("pagination"),
    loading: document.getElementById("loading"),
    errorContainer: document.getElementById("error-container"),
  };

  // Инициализация
  init();

  async function init() {
    showLoading();
    await loadData();
    hideLoading();
    setupEventListeners();
  }

  async function loadData() {
    try {
      const response = await fetch(
        `${config.apiEndpoint}?page=${state.currentPage}`
      );
      const result = await response.json();

      if (!result.success) throw new Error(result.error || "Ошибка сервера");

      renderContainers(result.data);
      renderPagination(result.pagination);
    } catch (error) {
      showError(error.message);
    }
  }

  function renderContainers(containers) {
    elements.containerList.innerHTML = containers
      .map(
        (container) => `
      <div class="col-md-4 mb-4">
        <div class="card h-100">
          <img src="${container.photo}" 
               class="card-img-top"
               alt="${container.type}"
               loading="lazy"
               onerror="handleImageError(this)">
          <div class="card-body">
            <h5 class="card-title">${container.type} ${container.number}</h5>
            <div class="card-text">
              <p><strong>Город:</strong> ${container.city}</p>
              <p><strong>Поставщик:</strong> ${container.supplier}</p>
              <p><strong>Терминал:</strong> ${container.terminal}</p>
              <p><strong>Ссылка:</strong> ${container.link}</p>
            </div>
          </div>
          <div class="card-footer">
            <span class="text-danger fw-bold">${container.price}</span>
          </div>
        </div>
      </div>
    `
      )
      .join("");
  }

  function renderPagination(pagination) {
    if (!pagination || pagination.totalPages <= 1) {
      elements.pagination.innerHTML = "";
      return;
    }

    elements.pagination.innerHTML = `
      <nav>
        <ul class="pagination">
          ${Array.from(
            { length: pagination.totalPages },
            (_, i) => `
            <li class="page-item ${
              i + 1 === state.currentPage ? "active" : ""
            }">
              <button class="page-link" data-page="${i + 1}">${i + 1}</button>
            </li>
          `
          ).join("")}
        </ul>
      </nav>
    `;
  }

  function setupEventListeners() {
    elements.pagination.addEventListener("click", (e) => {
      const pageBtn = e.target.closest("[data-page]");
      if (!pageBtn) return;

      state.currentPage = parseInt(pageBtn.dataset.page);
      loadData();
    });
  }

  function showLoading() {
    elements.loading.style.display = "flex";
  }

  function hideLoading() {
    elements.loading.style.display = "none";
  }

  function showError(message) {
    elements.errorContainer.innerHTML = `
      <div class="alert alert-danger">
        ${message}
        <button onclick="window.location.reload()">Обновить</button>
      </div>
    `;
  }
});

// Глобальная функция обработки ошибок изображений
window.handleImageError = function (img) {
  img.onerror = null;
  img.src = "/placeholder.jpg";

  if (img.src.includes("yandex.ru") || img.src.includes("imgur.com")) {
    fetch(`/api/image-proxy?url=${encodeURIComponent(img.src)}`).then(
      (res) =>
        res.ok &&
        (img.src = `/api/image-proxy?url=${encodeURIComponent(img.src)}`)
    );
  }
};
