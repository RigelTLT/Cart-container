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
    res.status(200).json({
      status: "OK",
      timestamp: new Date().toISOString(),
    });

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

// Добавляем лимитер запросов к Imgur
const imgurLimiter = {
  lastRequest: 0,
  async wait() {
    const now = Date.now();
    const delay = Math.max(0, 1100 - (now - this.lastRequest));
    this.lastRequest = now + delay;
    await new Promise((resolve) => setTimeout(resolve, delay));
  },
};

// Обновленная функция processImageUrl
const processImgurUrl = async (url) => {
  try {
    await imgurLimiter.wait();

    // Если это прямая ссылка на изображение
    if (url.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
      return url;
    }

    const imageId = url.split("/").pop().split(".")[0];

    // Для альбомов Imgur
    if (url.includes("/a/")) {
      const albumId = imageId;
      try {
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
        return (
          response.data.data.images[0]?.link ||
          `https://i.imgur.com/${albumId}.jpg`
        );
      } catch (apiError) {
        console.log("Using Imgur fallback for album");
        return `https://i.imgur.com/${albumId}.jpg`;
      }
    }

    // Для одиночных изображений
    return `https://i.imgur.com/${imageId}.jpg`;
  } catch (error) {
    console.error("Imgur processing error:", error);
    return "/placeholder.jpg";
  }
};

// Обновленная функция processImageUrl
async function processImageUrl(url) {
  if (!url || typeof url !== "string") {
    return "/placeholder.jpg";
  }

  const cacheKey = `img:${url}`;
  if (imageCache.has(cacheKey)) {
    return imageCache.get(cacheKey);
  }

  try {
    new URL(url); // Валидация URL

    // Обработка Imgur
    if (url.includes("imgur.com")) {
      const result = await processImgurUrl(url);
      imageCache.set(cacheKey, result);
      return result;
    }

    // Обработка Яндекс.Диска
    if (url.includes("yandex.ru/d/")) {
      const publicKey = url.match(/d\/([^?#]+)/)[1];
      const resultUrl = `/yandex-proxy/${publicKey}`;
      imageCache.set(cacheKey, resultUrl);
      return resultUrl;
    }

    // Все остальные URL
    imageCache.set(cacheKey, url);
    return url;
  } catch (error) {
    console.error("Image processing error:", error.message);
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
            price: row.get("Цена") ? `${row.get("Цена")} Руб.` : "Без цены",
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
            price: row.get("Цена") ? `${row.get("Цена")} Руб.` : "Без цены",
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

    if (!url.startsWith("http")) {
      return res.redirect("/placeholder.jpg");
    }

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

// Обновленный прокси для Яндекс.Диска
app.get("/yandex-proxy/:publicKey", async (req, res) => {
  try {
    const publicKey = req.params.publicKey;
    if (!publicKey) {
      return res.redirect("/placeholder.jpg");
    }

    // Получаем download ссылку через API Яндекс.Диска
    const apiUrl = `https://cloud-api.yandex.net/v1/disk/public/resources/download?public_key=${encodeURIComponent(
      `https://disk.yandex.ru/d/${publicKey}`
    )}`;

    const apiResponse = await axios.get(apiUrl, {
      timeout: 8000,
      headers: {
        Accept: "application/json",
      },
    });

    if (!apiResponse.data.href) {
      throw new Error("No download link found");
    }

    // Загружаем файл по полученной ссылке
    const fileResponse = await axios.get(apiResponse.data.href, {
      responseType: "stream",
      timeout: 15000,
    });

    // Устанавливаем правильные заголовки
    res.set({
      "Content-Type": fileResponse.headers["content-type"],
      "Cache-Control": "public, max-age=86400", // Кэшируем на 1 день
    });

    fileResponse.data.pipe(res);
  } catch (error) {
    console.error("Yandex.Disk proxy error:", error.message);
    res.redirect("/placeholder.jpg");
  }
});

// Статические файлы
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Запуск сервера
const server = app
  .listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  })
  .on("error", (err) => {
    console.error("Server failed to start:", err);
    process.exit(1);
  });

process.on("SIGTERM", () => {
  server.close(() => {
    console.log("Server stopped");
    process.exit(0);
  });
});
