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

// Function to read chat logs
const readChatLogs = () => {
  if (fs.existsSync(chatLogsPath)) {
    const data = fs.readFileSync(chatLogsPath);
    return JSON.parse(data);
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

  // Check if the session is within the 24-hour window
  let sessionOpen = false;
  const lastMessage = chatLogs[from].slice(-1)[0];
  if (lastMessage) {
    const lastMessageTime = new Date(lastMessage.timestamp);
    const timeDifference = new Date(currentTime) - lastMessageTime;
    const hoursDifference = timeDifference / (1000 * 60 * 60);
    if (hoursDifference < 24) {
      sessionOpen = true;
    }
  }

  // Append the new message to the chat log for this user
  chatLogs[from].push({
    from,
    message: incomingMessage,
    timestamp: currentTime,
  });

  if (!sessionOpen) {
    // Inform the user about the session window
    const sessionMessage =
      "A new session has started. You can chat with us for the next 24 hours.";
    await client.messages.create({
      body: sessionMessage,
      from: "whatsapp:+917499988012", // Your Twilio sandbox number
      to: from,
    });
    console.log("Session message sent to WhatsApp");

    // Update the session status
    sessionOpen = true;
  }

  if (sessionOpen) {
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
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
