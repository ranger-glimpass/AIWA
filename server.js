require('dotenv').config();

const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
const twilio = require("twilio");
const fs = require("fs");
const path = require("path");

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
    console.log("Sending message to OpenAI...");
    const openaiResponse = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-3.5-turbo",
        messages: [{ role: "user", content: incomingMessage }],
        max_tokens: 150,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
      },
    );

    console.log("Received response from OpenAI");

    const responseMessage =
      openaiResponse.data.choices[0].message.content.trim();
    console.log(`Response from OpenAI: ${responseMessage}`);

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
      console.error("Error response from OpenAI:", error.response.data);
    } else if (error.request) {
      console.error("No response received from OpenAI:", error.request);
    } else {
      console.error("Error in setting up OpenAI request:", error.message);
    }
    res.status(500).send("Error processing message");
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
