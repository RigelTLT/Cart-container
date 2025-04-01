require("dotenv").config();
const express = require("express");
const { GoogleSpreadsheet } = require("google-spreadsheet");
const { JWT } = require("google-auth-library");
const axios = require("axios");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.get("/health", (req, res) => {
  res.status(200).send("OK");
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

// Обработчик изображений
async function processImageUrl(url) {
  if (!url || typeof url !== "string") return "/placeholder.jpg";

  try {
    // Проверка на валидный URL
    new URL(url);

    // Обработка Imgur
    if (url.includes("imgur.com")) {
      if (url.includes("/a/")) {
        const albumId = url.split("/a/")[1].split("/")[0];
        const response = await axios.get(
          `https://api.imgur.com/3/album/${albumId}`,
          {
            headers: {
              Authorization: `Client-ID ${process.env.IMGUR_CLIENT_ID}`,
            },
          }
        );
        return response.data.data.images[0]?.link || "/placeholder.jpg";
      }
      return url.includes(".jpg") ? url : `${url}.jpg`;
    }

    // Обработка Яндекс.Диска
    if (url.includes("yandex.ru")) {
      if (url.includes("/d/")) {
        const apiUrl = `https://cloud-api.yandex.net/v1/disk/public/resources?public_key=${encodeURIComponent(
          url
        )}`;
        const response = await axios.get(apiUrl);
        const firstFile = response.data._embedded?.items?.find((item) =>
          item.mime_type?.startsWith("image/")
        );
        return firstFile?.file || "/placeholder.jpg";
      }
      return `https://getfile.dokpub.com/yandex/get/${url.split("/").pop()}`;
    }

    return url;
  } catch (error) {
    console.error("Image URL processing failed:", url, error);
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
app.get("/api/image-proxy", async (req, res) => {
  try {
    const url = decodeURIComponent(req.query.url);
    const response = await axios.get(url, { responseType: "stream" });
    res.set("Content-Type", response.headers["content-type"]);
    response.data.pipe(res);
  } catch (error) {
    res.redirect("/placeholder.jpg");
  }
});

// Статические файлы
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
