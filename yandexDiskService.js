const axios = require("axios");

const getYandexDirectLink = async (publicUrl) => {
  try {
    // Если ссылка уже прямая (например, через прокси)
    if (
      publicUrl.includes("getfile.dokpub.com") ||
      publicUrl.match(/\.(jpg|jpeg|png|gif|webp)$/i)
    ) {
      return publicUrl;
    }

    // Извлекаем ID файла/папки из URL
    const match = publicUrl.match(
      /disk\.yandex\.ru\/(?:d|client\/disk)\/([a-zA-Z0-9_-]+)/i
    );
    if (!match) return null;

    const resourceId = match[1];
    const apiUrl = `https://cloud-api.yandex.net/v1/disk/public/resources?public_key=${encodeURIComponent(
      publicUrl
    )}`;

    // Получаем метаданные ресурса
    const metaResponse = await axios.get(apiUrl);
    const resource = metaResponse.data;

    // Если это папка - берем первое изображение
    // В yandexDiskService.js
    if (resource._embedded) {
      const allImages = resource._embedded.items
        .filter((item) => item.media_type === "image")
        .map((item) => item.file);

      return allImages.length > 0 ? allImages[0] : null;
    }

    // Если это файл - возвращаем прямую ссылку
    return resource.file || publicUrl;
  } catch (error) {
    console.error("Yandex.Disk processing failed:", {
      url: publicUrl,
      error: error.response?.data || error.message,
    });
    return null;
  }
};

module.exports = { getYandexDirectLink };
