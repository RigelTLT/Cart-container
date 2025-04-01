document.addEventListener("DOMContentLoaded", function () {
  // Состояние приложения
  const state = {
    allContainers: [],
    filteredContainers: [],
    currentPage: 1,
    itemsPerPage: 10,
    searchQuery: "",
  };

  // Элементы DOM
  const elements = {
    containerList: document.getElementById("container-list"),
    pagination: document.getElementById("pagination"),
    loading: document.getElementById("loading"),
    searchInput: document.getElementById("search-input"),
    searchBtn: document.getElementById("search-btn"),
    resetSearch: document.getElementById("reset-search"),
    itemsPerPage: document.getElementById("items-per-page"),
    searchResults: document.getElementById("search-results"),
  };

  // Инициализация
  init();

  async function init() {
    setupEventListeners();
    await loadData();
  }

  async function loadData() {
    try {
      showLoading();

      const response = await fetch("/api/containers");
      if (!response.ok) throw new Error("Ошибка загрузки данных");

      const result = await response.json();
      if (!result.success) throw new Error(result.error || "Ошибка сервера");

      state.allContainers = result.data;
      state.filteredContainers = [...state.allContainers];

      renderContainers();
      renderPagination();
    } catch (error) {
      showError(error.message);
    } finally {
      hideLoading();
    }
  }

  function renderContainers() {
    const start = (state.currentPage - 1) * state.itemsPerPage;
    const end = start + state.itemsPerPage;
    const containersToShow = state.filteredContainers.slice(start, end);

    if (containersToShow.length === 0) {
      elements.containerList.innerHTML = `
        <div class="col-12">
          <div class="alert alert-warning">Ничего не найдено</div>
        </div>
      `;
      return;
    }

    elements.containerList.innerHTML = containersToShow
      .map(
        (container) => `
      <div class="col">
        <div class="card h-100">
          <img src="${
            container.photo.includes("yandex.ru")
              ? `/yandex-proxy?url=${encodeURIComponent(container.photo)}`
              : container.photo
          }"   
               class="card-img-top"
               alt="${container.type}"
               loading="lazy"
               onerror="this.src='/placeholder.jpg'">
          <div class="card-body">
            <h5 class="card-title">${highlightMatches(
              container.type
            )} ${highlightMatches(container.number)}</h5>
            <div class="card-text">
              <p><strong>Город:</strong> ${highlightMatches(container.city)}</p>
              <p><strong>Поставщик:</strong> ${highlightMatches(
                container.supplier
              )}</p>
              <p><strong>Терминал:</strong> ${highlightMatches(
                container.terminal
              )}</p>
              <p><strong>Ссылка:</strong><a href="${highlightMatches(
                container.link
              )}">Ссылка</a></p>
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

  function highlightMatches(text) {
    if (!state.searchQuery || !text) return text;

    const regex = new RegExp(state.searchQuery, "gi");
    return text
      .toString()
      .replace(regex, (match) => `<span class="highlight">${match}</span>`);
  }

  function renderPagination() {
    elements.pagination.innerHTML = "";

    const totalPages = Math.ceil(
      state.filteredContainers.length / state.itemsPerPage
    );
    if (totalPages <= 1) return;

    // Кнопка "Назад"
    const prevLi = document.createElement("li");
    prevLi.className = `page-item ${state.currentPage === 1 ? "disabled" : ""}`;
    prevLi.innerHTML = `<a class="page-link" href="#">Назад</a>`;
    prevLi.addEventListener("click", () => {
      if (state.currentPage > 1) {
        state.currentPage--;
        renderContainers();
        updatePagination();
      }
    });
    elements.pagination.appendChild(prevLi);

    // Номера страниц
    const maxVisiblePages = 5;
    let startPage = Math.max(
      1,
      state.currentPage - Math.floor(maxVisiblePages / 2)
    );
    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);

    if (endPage - startPage + 1 < maxVisiblePages) {
      startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }

    if (startPage > 1) {
      const firstLi = document.createElement("li");
      firstLi.className = "page-item";
      firstLi.innerHTML = `<a class="page-link" href="#">1</a>`;
      firstLi.addEventListener("click", () => {
        state.currentPage = 1;
        renderContainers();
        updatePagination();
      });
      elements.pagination.appendChild(firstLi);

      if (startPage > 2) {
        const ellipsisLi = document.createElement("li");
        ellipsisLi.className = "page-item disabled";
        ellipsisLi.innerHTML = `<span class="page-link">...</span>`;
        elements.pagination.appendChild(ellipsisLi);
      }
    }

    for (let i = startPage; i <= endPage; i++) {
      const pageLi = document.createElement("li");
      pageLi.className = `page-item ${i === state.currentPage ? "active" : ""}`;
      pageLi.innerHTML = `<a class="page-link" href="#">${i}</a>`;
      pageLi.addEventListener("click", () => {
        state.currentPage = i;
        renderContainers();
        updatePagination();
      });
      elements.pagination.appendChild(pageLi);
    }

    if (endPage < totalPages) {
      if (endPage < totalPages - 1) {
        const ellipsisLi = document.createElement("li");
        ellipsisLi.className = "page-item disabled";
        ellipsisLi.innerHTML = `<span class="page-link">...</span>`;
        elements.pagination.appendChild(ellipsisLi);
      }

      const lastLi = document.createElement("li");
      lastLi.className = "page-item";
      lastLi.innerHTML = `<a class="page-link" href="#">${totalPages}</a>`;
      lastLi.addEventListener("click", () => {
        state.currentPage = totalPages;
        renderContainers();
        updatePagination();
      });
      elements.pagination.appendChild(lastLi);
    }

    // Кнопка "Вперед"
    const nextLi = document.createElement("li");
    nextLi.className = `page-item ${
      state.currentPage === totalPages ? "disabled" : ""
    }`;
    nextLi.innerHTML = `<a class="page-link" href="#">Вперед</a>`;
    nextLi.addEventListener("click", () => {
      if (state.currentPage < totalPages) {
        state.currentPage++;
        renderContainers();
        updatePagination();
      }
    });
    elements.pagination.appendChild(nextLi);
  }

  function updatePagination() {
    window.scrollTo({ top: 0, behavior: "smooth" });
    renderPagination();
  }

  function performSearch() {
    state.searchQuery = elements.searchInput.value.trim().toLowerCase();
    state.currentPage = 1;

    if (!state.searchQuery) {
      state.filteredContainers = [...state.allContainers];
      elements.searchResults.classList.add("d-none");
    } else {
      state.filteredContainers = state.allContainers.filter((container) => {
        return (
          (container.city &&
            container.city.toLowerCase().includes(state.searchQuery)) ||
          (container.supplier &&
            container.supplier.toLowerCase().includes(state.searchQuery)) ||
          (container.type &&
            container.type.toLowerCase().includes(state.searchQuery)) ||
          (container.number &&
            container.number.toLowerCase().includes(state.searchQuery)) ||
          (container.terminal &&
            container.terminal.toLowerCase().includes(state.searchQuery))
        );
      });

      elements.searchResults.classList.remove("d-none");
      elements.searchResults.textContent = `Найдено: ${state.filteredContainers.length} контейнеров`;
    }

    renderContainers();
    renderPagination();
  }

  function setupEventListeners() {
    // Поиск
    elements.searchBtn.addEventListener("click", performSearch);
    elements.searchInput.addEventListener("keyup", (e) => {
      if (e.key === "Enter") performSearch();
    });

    // Сброс поиска
    elements.resetSearch.addEventListener("click", () => {
      elements.searchInput.value = "";
      performSearch();
    });

    // Изменение количества элементов на странице
    elements.itemsPerPage.addEventListener("change", () => {
      state.itemsPerPage = parseInt(elements.itemsPerPage.value);
      state.currentPage = 1;
      renderContainers();
      renderPagination();
    });
  }

  function showLoading() {
    elements.loading.style.display = "flex";
  }

  function hideLoading() {
    elements.loading.style.display = "none";
  }

  function showError(message) {
    elements.containerList.innerHTML = `
      <div class="col-12">
        <div class="alert alert-danger">${message}</div>
      </div>
    `;
  }

  // Глобальная функция для обработки ошибок изображений
  window.handleImageError = function (img) {
    img.onerror = null;
    img.src = "/placeholder.jpg";
  };
});
