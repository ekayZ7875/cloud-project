import api from './apiClient';

export async function createFolder(payload) {
  // payload: { name, parentFolderId? }
  return api.post('/folder/create-folder', payload);
}

export async function moveFileToFolder(fileId, targetFolderId) {
  return api.post('/folder/move-file-to-folder', { targetFolderId }, { params: { fileId } });
}

export async function bulkMoveFiles(fileIds, targetFolderId) {
  return api.post('/folder/bulk-move-files', { fileIds, targetFolderId });
}

export async function getFilesInFolder(folderId) {
  return api.get('/folder/get-files', { folderId });
}

export async function getAllFolders() {
  return api.get('/folder/get-all-folders');
}
