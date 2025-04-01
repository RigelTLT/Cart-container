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
    const parsedUrl = new URL(url);

    // Обработка Imgur
    if (url.includes("imgur.com")) {
      try {
        // Для прямых ссылок на изображения
        if (url.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
          // Проверим доступность изображения
          await axios.head(url, { timeout: 3000 });
          imageCache.set(cacheKey, url);
          return url;
        }

        // Для альбомов и одиночных изображений
        let imageId;
        if (url.includes("/a/")) {
          // Альбомы Imgur
          imageId = url.split("/a/")[1].split(/[?#/]/)[0];
        } else {
          // Одиночные изображения
          imageId = parsedUrl.pathname.split("/").pop().split(".")[0];
        }

        // Попробуем разные форматы
        const formats = ["jpg", "png", "jpeg", "webp"];
        for (const format of formats) {
          const testUrl = `https://i.imgur.com/${imageId}.${format}`;
          try {
            await axios.head(testUrl, { timeout: 3000 });
            imageCache.set(cacheKey, testUrl);
            return testUrl;
          } catch (e) {
            continue;
          }
        }

        return "/placeholder.jpg";
      } catch (error) {
        console.error("Imgur processing error:", error);
        return "/placeholder.jpg";
      }
    }

    // Обработка Яндекс.Диска
    if (url.includes("yandex.ru/d/") || url.includes("disk.yandex.ru/d/")) {
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
const yandexCache = new Map();
// Обновленный прокси для Яндекс.Диска
app.get("/yandex-proxy/:publicKey", async (req, res) => {
  const { publicKey } = req.params;
  if (!publicKey) {
    return res.redirect("/placeholder.jpg");
  }

  try {
    const publicUrl = `https://disk.yandex.ru/d/${publicKey}`;

    // 1. Проверяем, доступен ли ресурс
    const resourceUrl = `https://cloud-api.yandex.net/v1/disk/public/resources?public_key=${encodeURIComponent(
      publicUrl
    )}`;

    const resourceResponse = await axios.get(resourceUrl, {
      timeout: 10000, // Увеличиваем таймаут
      headers: {
        Accept: "application/json",
        Authorization: `OAuth ${process.env.YANDEX_OAUTH_TOKEN}`,
      },
    });

    // 2. Если ресурс не найден (404) или доступ запрещён (403)
    if (resourceResponse.status !== 200) {
      throw new Error(`Yandex.Disk API error: ${resourceResponse.statusText}`);
    }

    const resourceData = resourceResponse.data;

    // 3. Если это папка — ищем первое изображение внутри
    if (resourceData.type === "dir" && resourceData._embedded?.items) {
      const images = resourceData._embedded.items.filter(
        (item) => item.type === "file" && item.mime_type?.startsWith("image/")
      );

      if (images.length === 0) {
        throw new Error("No images found in the folder");
      }

      // Берём первое изображение (можно добавить выбор через ?image=1 в URL)
      const firstImage = images[0];
      const downloadUrl = `https://cloud-api.yandex.net/v1/disk/public/resources/download?public_key=${encodeURIComponent(
        firstImage.public_url
      )}`;

      const downloadResponse = await axios.get(downloadUrl, {
        timeout: 10000,
        headers: {
          Accept: "application/json",
          Authorization: `OAuth ${process.env.YANDEX_OAUTH_TOKEN}`,
        },
      });

      if (!downloadResponse.data?.href) {
        throw new Error("Download link not found");
      }

      // Загружаем и отдаём изображение
      const fileResponse = await axios.get(downloadResponse.data.href, {
        responseType: "stream",
        timeout: 15000,
      });

      res.set({
        "Content-Type": fileResponse.headers["content-type"],
        "Cache-Control": "public, max-age=86400",
      });
      return fileResponse.data.pipe(res);
    }

    // 4. Если это файл — проверяем, что это изображение
    if (resourceData.type === "file") {
      if (!resourceData.mime_type?.startsWith("image/")) {
        throw new Error("Resource is not an image");
      }

      const downloadUrl = `https://cloud-api.yandex.net/v1/disk/public/resources/download?public_key=${encodeURIComponent(
        publicUrl
      )}`;

      const downloadResponse = await axios.get(downloadUrl, {
        timeout: 10000,
        headers: {
          Accept: "application/json",
          Authorization: `OAuth ${process.env.YANDEX_OAUTH_TOKEN}`,
        },
      });

      if (!downloadResponse.data?.href) {
        throw new Error("Download link not found");
      }

      const fileResponse = await axios.get(downloadResponse.data.href, {
        responseType: "stream",
        timeout: 15000,
      });

      res.set({
        "Content-Type": fileResponse.headers["content-type"],
        "Cache-Control": "public, max-age=86400",
      });
      return fileResponse.data.pipe(res);
    }

    throw new Error("Unknown resource type");
  } catch (error) {
    console.error(
      `Yandex.Disk error (publicKey: ${publicKey}):`,
      error.message
    );
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
