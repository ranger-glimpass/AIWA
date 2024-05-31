require('dotenv').config();
const axios = require('axios');
const { Document, VectorStoreIndex } = require('llamaindex');

// Function to fetch the content from a Google Drive link
const fetchFileFromGoogleDrive = async (url) => {
  try {
    const response = await axios.get(url);
    return response.data;
  } catch (error) {
    console.error('Error fetching file from Google Drive:', error);
    throw new Error('Failed to fetch file from Google Drive');
  }
};

// Function to send a request to LlamaIndex API and get a response
const getLlamaResponse = async (query) => {
  try {
    // Google Drive direct download link
    const googleDriveLink = 'https://drive.google.com/uc?export=download&id=13Qwdp1GY9bqbKB-llo_BT78_xpFpLAA6';
    const text = await fetchFileFromGoogleDrive(googleDriveLink);

    // Create Document object with text
    const document = new Document({ text });

    // Split text and create embeddings. Store them in a VectorStoreIndex
    const index = await VectorStoreIndex.fromDocuments([document]);

    // Query the index
    const queryEngine = index.asQueryEngine();
    const response = await queryEngine.query({ query });

    // Output response
    return response.toString();
  } catch (error) {
    console.error('Error fetching LlamaIndex response:', error);
    return 'Error fetching response from LlamaIndex.';
  }
};

// Test the LlamaIndex API
const testLlamaIndex = async () => {
  const context = "Act as: AI Counsellor\n And user asks: ";
  const query = 'Who is the owner?';
  const response = await getLlamaResponse(context + query);
  console.log('LlamaIndex response:', response);
};

// Run the test
testLlamaIndex();
