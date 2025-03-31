document.addEventListener("DOMContentLoaded", function () {
  const config = {
    apiEndpoint: "/api/containers",
    itemsPerPage: 10,
  };

  const state = {
    currentPage: 1,
    totalPages: 1,
  };

  const elements = {
    containerList: document.getElementById("container-list"),
    pagination: document.getElementById("pagination"),
    loading: document.getElementById("loading"),
    errorContainer: document.getElementById("error-container"),
  };

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
        `${config.apiEndpoint}?page=${state.currentPage}&limit=${config.itemsPerPage}`
      );

      if (!response.ok) throw new Error("Ошибка загрузки данных");

      const result = await response.json();

      if (!result.success) throw new Error(result.error || "Ошибка сервера");

      renderContainers(result.data);
      renderPagination(result.pagination);
      state.totalPages = result.pagination.totalPages;
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
               class="card-img-top lazy-image"
               alt="${container.type}"
               loading="lazy"
               onerror="handleImageError(this)">
          <div class="card-body">
            <h5 class="card-title">${container.type} ${container.number}</h5>
            <div class="card-text">
              <p><strong>Город:</strong> ${container.city}</p>
              <p><strong>Поставщик:</strong> ${container.supplier}</p>
              <p><strong>Терминал:</strong> ${container.terminal}</p>
            </div>
          </div>
          <div class="card-footer bg-white">
            <span class="text-danger fw-bold">${container.price}</span>
          </div>
        </div>
      </div>
    `
      )
      .join("");
  }

  function handleImageError(img) {
    console.error("Ошибка загрузки изображения:", img.src);
    img.onerror = null;

    // Пробуем загрузить через прокси, если это Яндекс.Диск
    if (img.src.includes("yandex.ru")) {
      img.src = `/api/yandex-image?url=${encodeURIComponent(img.src)}`;
    } else {
      img.src = "/placeholder.jpg";
    }
  }

  function renderPagination(pagination) {
    if (!pagination || pagination.totalPages <= 1) {
      elements.pagination.innerHTML = "";
      return;
    }

    let html = `<nav><ul class="pagination">`;

    // Кнопка "Назад"
    html += `<li class="page-item ${state.currentPage === 1 ? "disabled" : ""}">
      <button class="page-link" data-page="${
        state.currentPage - 1
      }">Назад</button>
    </li>`;

    // Номера страниц
    const startPage = Math.max(1, state.currentPage - 2);
    const endPage = Math.min(pagination.totalPages, state.currentPage + 2);

    for (let i = startPage; i <= endPage; i++) {
      html += `<li class="page-item ${i === state.currentPage ? "active" : ""}">
        <button class="page-link" data-page="${i}">${i}</button>
      </li>`;
    }

    // Кнопка "Вперед"
    html += `<li class="page-item ${
      state.currentPage === pagination.totalPages ? "disabled" : ""
    }">
      <button class="page-link" data-page="${
        state.currentPage + 1
      }">Вперед</button>
    </li>`;

    html += `</ul></nav>`;
    elements.pagination.innerHTML = html;
  }

  function setupEventListeners() {
    elements.pagination.addEventListener("click", (e) => {
      const target = e.target.closest("[data-page]");
      if (!target) return;

      const newPage = parseInt(target.dataset.page);
      if (
        newPage >= 1 &&
        newPage <= state.totalPages &&
        newPage !== state.currentPage
      ) {
        state.currentPage = newPage;
        loadData();
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
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
      <div class="alert alert-danger alert-dismissible fade show">
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
      </div>
    `;
  }
});
