const { BlobServiceClient } = require('@azure/storage-blob');
const { v4: uuidv4 } = require('uuid');

const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
const containerName = process.env.AZURE_STORAGE_CONTAINER_NAME || 'interview-uploads';

let containerClient = null;

async function getContainerClient() {
  if (!containerClient) {
    const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
    containerClient = blobServiceClient.getContainerClient(containerName);
    await containerClient.createIfNotExists();
  }
  return containerClient;
}

/**
 * Upload a file to Azure Blob Storage
 * @param {Buffer} fileBuffer - File content
 * @param {string} originalName - Original file name
 * @returns {Promise<{blobName: string, url: string}>}
 */
async function uploadFile(fileBuffer, originalName) {
  const container = await getContainerClient();
  const ext = originalName.split('.').pop();
  const blobName = `${uuidv4()}.${ext}`;
  const blockBlobClient = container.getBlockBlobClient(blobName);

  await blockBlobClient.upload(fileBuffer, fileBuffer.length, {
    blobHTTPHeaders: { blobContentType: getMimeType(ext) }
  });

  return { blobName, url: blockBlobClient.url };
}

/**
 * Delete a blob from storage (privacy cleanup)
 * @param {string} blobName
 */
async function deleteFile(blobName) {
  try {
    const container = await getContainerClient();
    const blockBlobClient = container.getBlockBlobClient(blobName);
    await blockBlobClient.deleteIfExists();
  } catch (err) {
    console.error('Error deleting blob:', blobName, err.message);
  }
}

/**
 * Delete multiple blobs (session cleanup)
 * @param {string[]} blobNames
 */
async function deleteFiles(blobNames) {
  await Promise.all(blobNames.map(name => deleteFile(name)));
}

function getMimeType(ext) {
  const types = {
    pdf: 'application/pdf',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    doc: 'application/msword',
    txt: 'text/plain'
  };
  return types[ext.toLowerCase()] || 'application/octet-stream';
}

module.exports = { uploadFile, deleteFile, deleteFiles };
