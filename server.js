require("dotenv").config();
const express = require("express");
const path = require("path");
const cors = require("cors");
const { getDataFromGoogleSheet } = require("./googleSheetsService");
const { convertYandexDiskLinks } = require("./yandexDiskService");

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files from frontend
app.use(express.static(path.join(__dirname, "frontend", "public")));

// API endpoint
app.get("/api/containers", async (req, res) => {
  try {
    let data = await getDataFromGoogleSheet();

    data = await Promise.all(
      data.map(async (item) => {
        if (item.Фото) {
          item.photoUrl = await convertYandexDiskLinks(item.Фото);
        }
        return {
          city: item.Город,
          supplier: item.Поставщик,
          type: item.Тип,
          number: item.Номер,
          photo: item.photoUrl || "",
          terminal: item.Терминал,
          price: item.Цена,
        };
      })
    );

    res.json(data);
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Handle SPA routing
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "frontend", "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
