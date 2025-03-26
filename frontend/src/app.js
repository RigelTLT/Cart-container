document.addEventListener("DOMContentLoaded", () => {
  const tableHead = document.querySelector("#data-table thead");
  const tableBody = document.querySelector("#data-table tbody");
  const loading = document.querySelector("#loading");
  const errorDiv = document.querySelector("#error");

  async function loadData() {
    try {
      const response = await fetch("/api/data");

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      renderTable(data);
    } catch (error) {
      showError(error);
    } finally {
      loading.style.display = "none";
    }
  }

  function renderTable(data) {
    if (!data || data.length === 0) {
      showError(new Error("Нет данных для отображения"));
      return;
    }

    // Очистка таблицы
    tableHead.innerHTML = "";
    tableBody.innerHTML = "";

    // Заголовки
    const headerRow = document.createElement("tr");
    data[0].forEach((header) => {
      const th = document.createElement("th");
      th.textContent = header;
      headerRow.appendChild(th);
    });
    tableHead.appendChild(headerRow);

    // Данные
    data.slice(1).forEach((row) => {
      const tr = document.createElement("tr");
      row.forEach((cell) => {
        const td = document.createElement("td");
        td.textContent = cell;
        tr.appendChild(td);
      });
      tableBody.appendChild(tr);
    });
  }

  function showError(error) {
    console.error("Error:", error);
    errorDiv.textContent = `Ошибка: ${error.message}`;
  }

  // Первоначальная загрузка
  loadData();
});
