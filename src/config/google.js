const { google } = require("googleapis");

module.exports = {
  auth: new google.auth.GoogleAuth({
    credentials: process.env.GOOGLE_CREDENTIALS
      ? JSON.parse(process.env.GOOGLE_CREDENTIALS)
      : require("../../service-account.json"),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  }),
  sheets: google.sheets({ version: "v4" }),
  spreadsheetId: process.env.SPREADSHEET_ID,
};
