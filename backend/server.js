require("dotenv").config();
const express = require("express");
const { google } = require("googleapis");
const cors = require("cors");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());

// Аутентификация Google
const auth = new google.auth.GoogleAuth({
  keyFile: path.join(__dirname, "service-account.json"),
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

// Получение данных
app.get("/api/data", async (req, res) => {
  try {
    const sheets = google.sheets({
      version: "v4",
      auth: await auth.getClient(),
    });
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: "'ОС НВ'!A:G",
    });
    res.json(response.data.values);
  } catch (error) {
    console.error("API Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Обслуживание фронтенда
app.use(express.static(path.join(__dirname, "../frontend")));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`Server running on http://localhost:${PORT}`)
);
