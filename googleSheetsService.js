const { GoogleSpreadsheet } = require("google-spreadsheet");

const getDataFromGoogleSheet = async () => {
  const doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEET_ID);

  await doc.useServiceAccountAuth({
    client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
  });

  await doc.loadInfo();
  const sheet = doc.sheetsByIndex[0];
  const rows = await sheet.getRows();

  return rows.map((row) => ({
    Город: row.Город,
    Поставщик: row.Поставщик,
    Тип: row.Тип,
    Номер: row.Номер,
    Фото: row.Фото,
    Терминал: row.Терминал,
    Цена: row.Цена,
  }));
};

module.exports = { getDataFromGoogleSheet };
