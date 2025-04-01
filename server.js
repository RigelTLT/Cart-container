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

// Обновленная функция processImageUrl
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
    if (url.includes("imgur.com")) {
      try {
        // Для прямых ссылок на изображения
        if (url.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
          imageCache.set(cacheKey, url);
          return url;
        }

        // Для альбомов
        if (url.includes("/a/")) {
          const albumId = url.split("/a/")[1].split(/[?#/]/)[0];
          const resultUrl = `https://i.imgur.com/${albumId}.jpg`;
          imageCache.set(cacheKey, resultUrl);
          return resultUrl;
        }

        // Для одиночных изображений
        const imageId = url.split("/").pop().split(".")[0];
        const resultUrl = `https://i.imgur.com/${imageId}.jpg`;
        imageCache.set(cacheKey, resultUrl);
        return resultUrl;
      } catch (error) {
        console.error("Imgur processing error:", error);
        return "/placeholder.jpg";
      }
    }

    // Обработка Яндекс.Диска
    if (url.includes("yandex.ru/d/")) {
      const publicKey = url.match(/d\/([^?#]+)/)[1];
      const resultUrl = `/yandex-proxy/${publicKey}`;
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

    const fileResponse = await axios.get(apiResponse.data.href, {
      responseType: "stream",
      timeout: 15000,
    });

    res.set("Content-Type", fileResponse.headers["content-type"]);
    fileResponse.data.pipe(res);
  } catch (error) {
    console.error("Yandex.Disk error:", error.message);
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
