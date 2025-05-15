// Утилиты для работы с Dropbox API
// Требует установки npm-пакета: dropbox
// Для работы нужен ACCESS TOKEN (лучше хранить в переменных окружения)

import { Dropbox } from 'dropbox';

const ACCESS_TOKEN = process.env.REACT_APP_DROPBOX_TOKEN; // Добавьте свой токен в .env

const dbx = new Dropbox({ accessToken: ACCESS_TOKEN, fetch });

export async function uploadFile(path, fileBlob) {
  // path: '/signatures/signature.png' или '/documents/filename.pdf'
  return dbx.filesUpload({
    path,
    contents: fileBlob,
    mode: { ".tag": "overwrite" }
  });
}

export async function downloadFile(path) {
  // Возвращает blob
  const res = await dbx.filesDownload({ path });
  return res.fileBlob;
}

export async function deleteFile(path) {
  return dbx.filesDeleteV2({ path });
}

export async function getTemporaryLink(path) {
  // Получить временную ссылку для скачивания файла
  const res = await dbx.filesGetTemporaryLink({ path });
  return res.link;
}
