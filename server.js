require("dotenv").config();
const express = require("express");
const { GoogleSpreadsheet } = require("google-spreadsheet");
const { JWT } = require("google-auth-library");
const axios = require("axios");
const path = require("path");
const fs = require("fs");
const imageCache = new Map();
const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Создаем placeholder.jpg если его нет
const placeholderPath = path.join(__dirname, "public", "placeholder.jpg");
if (!fs.existsSync(placeholderPath)) {
  fs.writeFileSync(placeholderPath, "");
}

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

// Добавляем функцию для очистки кэша Imgur
function cleanImgurCache() {
  const now = Date.now();
  const cacheTimeout = 24 * 60 * 60 * 1000; // 24 часа

  for (const [key, value] of imageCache.entries()) {
    if (
      key.startsWith("img:https://imgur.com") ||
      key.startsWith("img:https://i.imgur.com")
    ) {
      // Если запись в кэше старше 24 часов, удаляем её
      if (now - value.timestamp > cacheTimeout) {
        imageCache.delete(key);
      }
      // Дополнительно проверяем доступность изображения
      axios
        .head(value.url, { timeout: 2000 })
        .catch(() => imageCache.delete(key));
    }
  }
}

// Функция проверки доступности изображения
async function checkImageAvailable(url) {
  try {
    await axios.head(url, { timeout: 2000 });
    return true;
  } catch {
    return false;
  }
}

// Обновленная функция processImageUrl с использованием IMGUR_CLIENT_ID
async function processImageUrl(url) {
  if (!url || typeof url !== "string") {
    return "/placeholder.jpg";
  }

  const cacheKey = `img:${url}`;
  // Проверяем кэш с дополнительной валидацией для Imgur
  if (imageCache.has(cacheKey)) {
    const cached = imageCache.get(cacheKey);
    // Для Imgur делаем дополнительную проверку доступности
    if (!url.includes("imgur.com") || (await checkImageAvailable(cached.url))) {
      return cached.url;
    }
    imageCache.delete(cacheKey); // Удаляем неработающую ссылку
  }

  try {
    const parsedUrl = new URL(url);

    // Обработка Imgur с Client-ID
    if (url.includes("imgur.com")) {
      try {
        // Для прямых ссылок на изображения
        if (url.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
          await axios.head(url, {
            timeout: 3000,
            headers: {
              Authorization: `Client-ID ${process.env.IMGUR_CLIENT_ID}`,
            },
          });
          imageCache.set(cacheKey, { url, timestamp: Date.now() });
          return url;
        }

        let imageId;
        if (url.includes("/a/")) {
          // Для альбомов используем API Imgur
          const albumId = url.split("/a/")[1].split(/[?#/]/)[0];
          const albumResponse = await axios.get(
            `https://api.imgur.com/3/album/${albumId}`,
            {
              headers: {
                Authorization: `Client-ID ${process.env.IMGUR_CLIENT_ID}`,
              },
              timeout: 3000,
            }
          );

          if (albumResponse.data.data?.images?.length > 0) {
            const firstImage = albumResponse.data.data.images[0];
            imageCache.set(cacheKey, {
              url: firstImage.link,
              timestamp: Date.now(),
            });
            return firstImage.link;
          }
          return "/placeholder.jpg";
        } else {
          // Для одиночных изображений
          imageId = parsedUrl.pathname.split("/").pop().split(".")[0];
          const imageResponse = await axios.get(
            `https://api.imgur.com/3/image/${imageId}`,
            {
              headers: {
                Authorization: `Client-ID ${process.env.IMGUR_CLIENT_ID}`,
              },
              timeout: 3000,
            }
          );

          if (imageResponse.data.data?.link) {
            imageCache.set(cacheKey, {
              url: imageResponse.data.data.link,
              timestamp: Date.now(),
            });
            return imageResponse.data.data.link;
          }
          return "/placeholder.jpg";
        }
      } catch (error) {
        console.error("Imgur API error:", error);
        // Fallback к старому методу, если API не сработал
        let imageId;
        if (url.includes("/a/")) {
          imageId = url.split("/a/")[1].split(/[?#/]/)[0];
        } else {
          imageId = parsedUrl.pathname.split("/").pop().split(".")[0];
        }

        const formats = ["jpg", "png", "jpeg", "webp"];
        for (const format of formats) {
          const testUrl = `https://i.imgur.com/${imageId}.${format}`;
          try {
            await axios.head(testUrl, { timeout: 3000 });
            imageCache.set(cacheKey, { url: testUrl, timestamp: Date.now() });
            return testUrl;
          } catch (e) {
            continue;
          }
        }
        return "/placeholder.jpg";
      }
    }

    // Обработка Яндекс.Диска
    if (url.includes("yandex.ru/d/") || url.includes("disk.yandex.ru/d/")) {
      const publicKey = url.match(/d\/([^?#]+)/)[1];
      const resultUrl = `/yandex-proxy/${publicKey}`;
      imageCache.set(cacheKey, { url: resultUrl, timestamp: Date.now() });
      return resultUrl;
    }

    imageCache.set(cacheKey, { url, timestamp: Date.now() });
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

    // Фильтруем строки, где поле "ко" не пустое
    const filteredRows = rows.filter((row) => {
      const city = row.get("ко");
      return city && city.trim() !== "";
    });

    const data = await Promise.all(
      filteredRows.map(async (row) => {
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
        total: data.length,
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
  const cacheKey = `yandex:${publicKey}`;

  if (!publicKey) {
    console.error("Missing publicKey parameter");
    return res.redirect("/placeholder.jpg");
  }

  // Проверяем кэш
  if (yandexCache.has(cacheKey)) {
    const cached = yandexCache.get(cacheKey);
    if (cached.expires > Date.now()) {
      return res.redirect(cached.url);
    }
    yandexCache.delete(cacheKey);
  }

  try {
    const publicUrl = `https://disk.yandex.ru/d/${publicKey}`;

    // 1. Пробуем получить HTML страницы и извлечь прямые ссылки на изображения
    const htmlResponse = await axios.get(publicUrl, {
      timeout: 5000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
      },
    });

    // Ищем все изображения в HTML
    const imageLinks = [];
    const regex = /https:\/\/[^"]+\.(jpg|jpeg|png|gif|webp)(\?[^"]+)?/gi;
    let match;
    while ((match = regex.exec(htmlResponse.data)) !== null) {
      if (
        match[0].includes("downloader.disk.yandex.ru") ||
        match[0].includes("avatars.mds.yandex.net")
      ) {
        imageLinks.push(match[0]);
      }
    }

    // Если нашли прямые ссылки на изображения
    if (imageLinks.length > 0) {
      // Проверяем доступность первого изображения
      try {
        await axios.head(imageLinks[0], { timeout: 3000 });

        // Кэшируем на 6 часов
        yandexCache.set(cacheKey, {
          url: imageLinks[0],
          expires: Date.now() + 6 * 60 * 60 * 1000,
        });

        return res.redirect(imageLinks[0]);
      } catch (e) {
        console.log(`Image link not available: ${imageLinks[0]}`);
      }
    }

    // 2. Если не нашли прямые ссылки, пробуем API для публичных папок
    try {
      const apiResponse = await axios.get(
        "https://cloud-api.yandex.net/v1/disk/public/resources",
        {
          params: {
            public_key: publicUrl,
            limit: 100,
          },
          timeout: 10000,
        }
      );

      const resourceData = apiResponse.data;

      // Если это папка с файлами
      if (resourceData._embedded && resourceData._embedded.items) {
        const images = resourceData._embedded.items.filter(
          (item) =>
            item.type === "file" &&
            item.mime_type &&
            item.mime_type.startsWith("image/")
        );

        if (images.length > 0) {
          // Берем первое изображение
          const image = images[0];
          const downloadUrl = `https://cloud-api.yandex.net/v1/disk/public/resources/download?public_key=${encodeURIComponent(
            image.public_url
          )}`;

          const downloadResponse = await axios.get(downloadUrl, {
            timeout: 10000,
          });

          if (downloadResponse.data && downloadResponse.data.href) {
            // Кэшируем на 6 часов
            yandexCache.set(cacheKey, {
              url: downloadResponse.data.href,
              expires: Date.now() + 6 * 60 * 60 * 1000,
            });

            return res.redirect(downloadResponse.data.href);
          }
        }
      }
    } catch (apiError) {
      console.error(`Yandex API error: ${apiError.message}`);
    }

    // 3. Fallback - пробуем стандартный путь к изображению
    const fallbackUrl = `https://downloader.disk.yandex.ru/disk/${publicKey}/`;
    try {
      await axios.head(fallbackUrl, { timeout: 3000 });
      return res.redirect(fallbackUrl);
    } catch (fallbackError) {
      console.error(`Fallback method failed: ${fallbackError.message}`);
    }

    // Если ничего не сработало
    throw new Error("All methods failed");
  } catch (error) {
    console.error(
      `Yandex.Disk processing error [${publicKey}]:`,
      error.message
    );
    return res.redirect("/placeholder.jpg");
  }
});

// Запускаем периодическую очистку кэша
setInterval(cleanImgurCache, 60 * 60 * 1000); // Каждый час

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
