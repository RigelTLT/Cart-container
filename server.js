require("dotenv").config();
const express = require("express");
const path = require("path");
const cors = require("cors");
const axios = require("axios");
const { GoogleSpreadsheet } = require("google-spreadsheet");
const { JWT } = require("google-auth-library");

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Инициализация Google Sheets
const getDoc = async () => {
  const serviceAccountAuth = new JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  const doc = new GoogleSpreadsheet(
    process.env.GOOGLE_SHEET_ID,
    serviceAccountAuth
  );
  await doc.loadInfo();
  return doc;
};

// Обработка ссылок Яндекс.Диска
function processYandexUrl(url) {
  if (!url) return "/placeholder.jpg";

  // Если ссылка уже прямая
  if (
    url.includes("getfile.dokpub.com") ||
    url.match(/\.(jpg|jpeg|png|gif|webp)$/i)
  ) {
    return url;
  }

  // Для публичных папок
  if (url.includes("yandex.ru/d/")) {
    const folderId = url.split("/d/")[1].split("/")[0];
    return `https://cloud-api.yandex.net/v1/disk/public/resources?public_key=${encodeURIComponent(
      url
    )}`;
  }

  // Для прямых файлов
  if (url.includes("yandex.ru/client/disk")) {
    const filePath = encodeURIComponent(url.split("disk/")[1]);
    return `https://getfile.dokpub.com/yandex/get/disk:/${filePath}`;
  }

  return "/placeholder.jpg";
}

// API endpoint
app.get("/api/containers", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    const doc = await getDoc();
    const sheet = doc.sheetsByIndex[0];
    await sheet.loadHeaderRow();
    const rows = await sheet.getRows({ offset, limit });
    const totalRows = sheet.rowCount;

    const data = await Promise.all(
      rows.map(async (row) => {
        const photoUrl = row.get("Фото")
          ? await getYandexDirectLink(row.get("Фото"))
          : "/placeholder.jpg";

        return {
          city: row.get("ко"),
          supplier: row.get("Поставщик"),
          type: row.get("Тип"),
          number: row.get("Номер"),
          photo: photoUrl,
          terminal: row.get("Терминал"),
          price: row.get("Цена"),
        };
      })
    );

    res.json({
      success: true,
      data,
      pagination: {
        page,
        limit,
        total: totalRows,
        totalPages: Math.ceil(totalRows / limit),
        hasNextPage: page * limit < totalRows,
      },
    });
  } catch (error) {
    console.error("API Error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Получение прямой ссылки на изображение
async function getYandexDirectLink(url) {
  try {
    // Для публичных папок
    if (url.includes("yandex.ru/d/")) {
      const apiUrl = `https://cloud-api.yandex.net/v1/disk/public/resources?public_key=${encodeURIComponent(
        url
      )}`;
      const response = await axios.get(apiUrl);

      if (response.data._embedded) {
        const firstImage = response.data._embedded.items.find(
          (item) => item.media_type === "image"
        );
        return firstImage?.file || "/placeholder.jpg";
      }
      return "/placeholder.jpg";
    }

    // Для прямых ссылок
    return processYandexUrl(url);
  } catch (error) {
    console.error("Yandex Direct Link Error:", error);
    return "/placeholder.jpg";
  }
}

// Прокси для изображений (опционально)
app.get("/api/yandex-image", async (req, res) => {
  try {
    const url = decodeURIComponent(req.query.url);
    const directUrl = await getYandexDirectLink(url);

    if (directUrl.includes("placeholder.jpg")) {
      return res.redirect(directUrl);
    }

    const response = await axios.get(directUrl, { responseType: "stream" });
    res.set("Content-Type", response.headers["content-type"]);
    response.data.pipe(res);
  } catch (error) {
    console.error("Image Proxy Error:", error);
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
