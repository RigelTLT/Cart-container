const { auth, sheets, spreadsheetId } = require("../config/google");

module.exports = {
  async getData(range = "'ОС НВ'!A:G") {
    try {
      const authClient = await auth.getClient();
      const response = await sheets.spreadsheets.values.get({
        auth: authClient,
        spreadsheetId,
        range,
      });
      return response.data.values;
    } catch (error) {
      console.error("Sheets API Error:", error);
      throw error;
    }
  },
};
