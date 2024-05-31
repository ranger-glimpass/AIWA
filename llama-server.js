require('dotenv').config();

const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
const twilio = require("twilio");
const fs = require("fs");
const path = require("path");
const { Document, VectorStoreIndex } = require('llamaindex');

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN,
);

// Path to the JSON file where chat logs will be stored
const chatLogsPath = path.join(__dirname, "chatLogs.json");

// Initialize the JSON file if it doesn't exist
const initializeChatLogs = () => {
  if (!fs.existsSync(chatLogsPath)) {
    fs.writeFileSync(chatLogsPath, JSON.stringify({}));
  }
};

// Call the initialize function at the start
initializeChatLogs();

// Function to read chat logs
const readChatLogs = () => {
  if (fs.existsSync(chatLogsPath)) {
    const data = fs.readFileSync(chatLogsPath, 'utf8');
    try {
      return JSON.parse(data);
    } catch (error) {
      console.error("Error parsing JSON data:", error);
      return {};
    }
  }
  return {};
};

// Function to write chat logs
const writeChatLogs = (logs) => {
  fs.writeFileSync(chatLogsPath, JSON.stringify(logs, null, 2));
};

// Serve the HTML file
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// Endpoint to fetch chat logs
app.get("/chat-logs", (req, res) => {
  res.json(readChatLogs());
});

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

app.post("/webhook", async (req, res) => {
  const incomingMessage = req.body.Body;
  const from = req.body.From;

  console.log(`Received message from ${from}: ${incomingMessage}`);

  const chatLogs = readChatLogs();
  const currentTime = new Date().toISOString();

  if (!chatLogs[from]) {
    chatLogs[from] = [];
  }

  // Append the new message to the chat log for this user
  chatLogs[from].push({
    from,
    message: incomingMessage,
    timestamp: currentTime,
  });

  try {
    console.log("Sending message to LlamaIndex...");
    const responseMessage = await getLlamaResponse(incomingMessage);
    console.log(`Response from LlamaIndex: ${responseMessage}`);

    console.log("Sending response back to WhatsApp...");
    await client.messages.create({
      body: responseMessage,
      from: "whatsapp:+917499988012",
      to: from,
    });

    console.log("Message sent to WhatsApp");

    chatLogs[from].push({
      from: "bot",
      message: responseMessage,
      timestamp: currentTime,
    });

    writeChatLogs(chatLogs);

    res.status(200).send("Message processed and sent successfully");
  } catch (error) {
    if (error.response) {
      console.error("Error response from LlamaIndex:", error.response.data);
    } else if (error.request) {
      console.error("No response received from LlamaIndex:", error.request);
    } else {
      console.error("Error in setting up LlamaIndex request:", error.message);
    }
    res.status(500).send("Error processing message");
  }
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
