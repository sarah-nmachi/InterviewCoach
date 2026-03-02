const { AzureKeyCredential } = require('@azure/ai-form-recognizer');
const { DocumentAnalysisClient } = require('@azure/ai-form-recognizer');

const endpoint = process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT;
const key = process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY;

let client = null;

function getClient() {
  if (!client) {
    client = new DocumentAnalysisClient(endpoint, new AzureKeyCredential(key));
  }
  return client;
}

/**
 * Parse a document (PDF or DOCX) using Azure Document Intelligence
 * @param {Buffer} fileBuffer - The file buffer
 * @returns {Promise<string>} - Extracted text content
 */
async function parseDocument(fileBuffer) {
  const docClient = getClient();
  const poller = await docClient.beginAnalyzeDocument('prebuilt-read', fileBuffer);
  const result = await poller.pollUntilDone();

  let extractedText = '';
  if (result.content) {
    extractedText = result.content;
  } else if (result.pages) {
    for (const page of result.pages) {
      if (page.lines) {
        for (const line of page.lines) {
          extractedText += line.content + '\n';
        }
      }
    }
  }

  return extractedText.trim();
}

module.exports = { parseDocument };
