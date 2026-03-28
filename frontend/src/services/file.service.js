import api from './apiClient';

export async function uploadFile(file, onProgress) {
  const formData = new FormData();
  formData.append('file', file);
  return api.uploadWithProgress('/files/upload-file', formData, onProgress);
}

export async function uploadFolderBulk(files, folderName, onProgress) {
  const formData = new FormData();
  formData.append('folderName', folderName);
  for (let i = 0; i < files.length; i++) {
    formData.append('files', files[i]);
  }
  return api.uploadWithProgress('/files/upload-folder', formData, onProgress);
}

export async function getFiles() {
  return api.get('/files/get-files');
}

export async function getFile(fileId) {
  return api.get('/files/get-file', { fileId });
}

export async function softDeleteFile(fileId) {
  return api.post(`/files/delete-files?fileId=${fileId}`);
}

export async function softDeleteFolder(folderId) {
  return api.post('/files/delete-folder', { folderId });
}

export async function restoreItem(itemId, type) {
  return api.post('/files/restore-item', { itemId, type });
}

export async function permanentDelete(itemId, type, fileName = "") {
  return api.post('/files/permanent-delete', { itemId, type, fileName });
}

export async function toggleStar(fileId, isStarred) {
  return api.post('/files/star-file', { fileId, isStarred });
}

export async function getStarredFiles() {
  return api.get('/files/get-starred-files');
}

export async function getTrashedFiles() {
  return api.get('/files/get-trashed-files');
}

export async function getRecentFiles() {
  return api.get('/files/get-recent-files');
}

export async function getDownloadUrl(fileId, isDownload = false) {
  return api.post('/files/download-file', null, { params: { fileId, download: isDownload } });
}

export async function getStorageCapacity() {
  return api.get('/files/storage-capacity');
}

export async function getProcessingStatus(jobId) {
  return api.get(`/files/processing-status/${jobId}`);
}

export async function getFolders() {
  return api.get('/folder/get-all-folders');
}

export async function getFilesInFolder(folderId) {
  return api.get(`/folder/get-files?folderId=${folderId}`);
}

export async function createFolder(name, parentFolderId = null) {
  return api.post('/folder/create-folder', { name, parentFolderId });
}

export function mapProcessingAnalysis(job) {
  if (!job?.analysis) return null;
  const { summary, entities, tags, metadata } = job.analysis;
  return {
    summary: summary || null,
    entities: entities || [],
    tags: tags || [],
    metadata: metadata || {},
  };
}
