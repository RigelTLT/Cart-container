require("dotenv").config();
const express = require("express");
const { GoogleSpreadsheet } = require("google-spreadsheet");
const { JWT } = require("google-auth-library");
const axios = require("axios");
const path = require("path");
const imageCache = new Map();
const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.get("/health", async (req, res) => {
  try {
    // Быстрая проверка без подключения к БД
    res.status(200).json({
      status: "OK",
      timestamp: new Date().toISOString(),
    });

    // Асинхронная проверка БД (не блокирует ответ)
    setTimeout(async () => {
      try {
        const doc = await getDoc();
        await doc.loadInfo();
        console.log("DB connection verified");
      } catch (dbError) {
        console.error("DB check failed:", dbError);
      }
    }, 1000);
  } catch (error) {
    res.status(500).json({
      status: "Server error",
      error: error.message,
    });
  }
});

// Авторизация Google Sheets
async function getDoc() {
  const auth = new JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  const doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEET_ID, auth);
  await doc.loadInfo();
  return doc;
}

// переписанная функция processImageUrl
async function processImageUrl(url) {
  if (!url || typeof url !== "string") {
    return "/placeholder.jpg";
  }

  // Проверка кэша
  const cacheKey = `img:${url}`;
  if (imageCache.has(cacheKey)) {
    return imageCache.get(cacheKey);
  }

  try {
    // Проверка валидности URL
    new URL(url);

    // Обработка Imgur
    const imgurLimiter = {
      lastRequest: 0,
      async wait() {
        const now = Date.now();
        const delay = Math.max(0, 1100 - (now - this.lastRequest));
        this.lastRequest = now + delay;
        await new Promise((resolve) => setTimeout(resolve, delay));
      },
    };

    if (url.includes("imgur.com")) {
      await imgurLimiter.wait(); // Ограничение 1 запрос в секунду

      try {
        if (url.includes("/a/")) {
          const albumId = url.split("/a/")[1].split("/")[0];
          const response = await axios.get(
            `https://api.imgur.com/3/album/${albumId}`,
            {
              headers: {
                Authorization: `Client-ID ${
                  process.env.IMGUR_CLIENT_ID || "17c7de12c5f06c1"
                }`,
              },
              timeout: 3000,
            }
          );
          return response.data.data.images[0]?.link || "/placeholder.jpg";
        }
        return url.includes(".") ? url : `${url}.jpg`;
      } catch (error) {
        // Fallback для Imgur без API
        return url.replace("imgur.com/a/", "i.imgur.com/") + ".jpg";
      }
    }

    // Обработка Яндекс.Диска
    if (url.includes("yandex.ru/d/")) {
      // Проверяем кэш
      const cacheKey = `yandex:${url}`;
      if (imageCache.has(cacheKey)) {
        return imageCache.get(cacheKey);
      }

      const resultUrl = `/yandex-proxy?url=${encodeURIComponent(url)}`;
      imageCache.set(cacheKey, resultUrl);
      return resultUrl;
    }

    // Для всех остальных URL
    imageCache.set(cacheKey, url);
    return url;
  } catch (error) {
    console.error("Image processing error:", url, error.message);
    return "/placeholder.jpg";
  }
}

// API endpoint
app.get("/api/containers", async (req, res) => {
  try {
    const doc = await getDoc();
    const sheet = doc.sheetsByIndex[0];
    const rows = await sheet.getRows();

    const data = await Promise.all(
      rows.map(async (row) => {
        try {
          const imageUrl = await processImageUrl(row.get("Фото"));

          return {
            city: row.get("ко") || "Не указан",
            supplier: row.get("Поставщик") || "Не указан",
            type: row.get("Тип") || "Не указан",
            number: row.get("Номер") || "—",
            photo: imageUrl,
            terminal: row.get("Терминал") || "—",
            link: row.get("Фото"),
            price: row.get("Цена") + " Руб." || "Без цены",
          };
        } catch (error) {
          console.error("Error processing row:", error);
          return {
            city: row.get("ко") || "Не указан",
            supplier: row.get("Поставщик") || "Не указан",
            type: row.get("Тип") || "Не указан",
            number: row.get("Номер") || "—",
            photo: "/placeholder.jpg",
            terminal: row.get("Терминал") || "—",
            link: row.get("Фото"),
            price: row.get("Цена") + " Руб." || "Без цены",
          };
        }
      })
    );

    res.json({
      success: true,
      data,
      pagination: {
        total: rows.length,
        page: 1,
        totalPages: 1,
      },
    });
  } catch (error) {
    console.error("API Error:", error);
    res.status(500).json({
      success: false,
      error: "Internal Server Error",
      details: process.env.NODE_ENV === "development" ? error.message : null,
    });
  }
});

// Прокси для изображений
app.get("/image-proxy", async (req, res) => {
  try {
    const url = decodeURIComponent(req.query.url);

    // Блокировка невалидных URL
    if (!url.startsWith("http")) {
      return res.redirect("/placeholder.jpg");
    }

    // Стандартная обработка
    const response = await axios.get(url, {
      responseType: "stream",
      timeout: 5000,
    });

    res.set("Content-Type", response.headers["content-type"]);
    response.data.pipe(res);
  } catch (error) {
    console.error("Proxy error for URL:", req.query.url, error.message);
    res.redirect("/placeholder.jpg");
  }
});

app.get("/yandex-proxy", async (req, res) => {
  const MAX_RETRIES = 2;
  const RETRY_DELAY = 1500;
  let attempt = 0;

  const processRequest = async () => {
    try {
      const publicUrl = decodeURIComponent(req.query.url);
      const publicKey = publicUrl.split("/d/")[1]?.split(/[?#]/)[0];

      // Валидация URL
      if (!publicKey) {
        throw new Error("Некорректная ссылка Яндекс.Диска");
      }

      // 1. Получаем ссылку для скачивания
      const apiResponse = await axios.get(
        "https://cloud-api.yandex.net/v1/disk/public/resources/download",
        {
          params: { public_key: `https://disk.yandex.ru/d/${publicKey}` },
          timeout: 8000,
        }
      );

      // 2. Загружаем файл с повторами
      const downloadFile = async (url, retryCount = 0) => {
        try {
          const response = await axios.get(url, {
            responseType: "stream",
            timeout: 15000,
          });
          return response;
        } catch (error) {
          if (retryCount < MAX_RETRIES) {
            await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
            return downloadFile(url, retryCount + 1);
          }
          throw error;
        }
      };

      const fileResponse = await downloadFile(apiResponse.data.href);

      // 3. Отправляем файл клиенту
      res.set("Content-Type", fileResponse.headers["content-type"]);
      fileResponse.data.pipe(res);
    } catch (error) {
      attempt++;
      if (attempt <= MAX_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
        return processRequest();
      }

      console.error("Yandex.Disk final error:", {
        url: req.query.url,
        error: error.message,
        stack: error.stack,
      });

      // Fallback: пробуем альтернативный метод
      try {
        const publicKey = decodeURIComponent(req.query.url).split("/d/")[1];
        const fallbackUrl = `https://getfile.dokpub.com/yandex/get/${publicKey}`;
        const fallbackResponse = await axios.get(fallbackUrl, {
          responseType: "stream",
          timeout: 10000,
        });
        fallbackResponse.data.pipe(res);
      } catch (fallbackError) {
        res.redirect("/placeholder.jpg");
      }
    }
  };

  await processRequest();
});
// Статические файлы
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Запуск сервера с обработкой ошибок
const server = app
  .listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  })
  .on("error", (err) => {
    console.error("Server failed to start:", err);
    process.exit(1);
  });

// Обработка сигналов завершения
process.on("SIGTERM", () => {
  server.close(() => {
    console.log("Server stopped");
    process.exit(0);
  });
});
