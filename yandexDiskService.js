const axios = require("axios");

const convertYandexDiskLinks = async (url) => {
  try {
    // Если ссылка уже прямая на изображение
    if (url.match(/\.(jpg|jpeg|png|gif)$/i)) {
      return url;
    }

    // Преобразование публичной ссылки Яндекс.Диска в прямую
    if (url.includes("yandex.ru")) {
      const publicKey = url.split("/").pop();
      const directUrl = `https://cloud-api.yandex.net/v1/disk/public/resources/download?public_key=${encodeURIComponent(
        url
      )}`;

      const response = await axios.get(directUrl);
      return response.data.href;
    }

    return url;
  } catch (error) {
    console.error("Error converting Yandex.Disk link:", error);
    return url; // Возвращаем оригинальную ссылку в случае ошибки
  }
};

module.exports = { convertYandexDiskLinks };
