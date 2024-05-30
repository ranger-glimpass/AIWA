const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
const twilio = require("twilio");

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

// Add a GET route for testing
app.get("/", (req, res) => {
  res.send("Hello, this is your WhatsApp bot server!");
});

app.post("/webhook", async (req, res) => {
  const incomingMessage = req.body.Body;
  const from = req.body.From;

  // Log the incoming message and sender's number
  console.log(`Received message from ${from}: ${incomingMessage}`);

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
      }
    );

    console.log("Received response from OpenAI");

    const responseMessage = openaiResponse.data.choices[0].message.content.trim();
    console.log(`Sending response back to WhatsApp: ${responseMessage}`);

    await client.messages.create({
      body: responseMessage,
      from: `whatsapp:${process.env.FROM_NUMBER}`,
      to: from,
    });

    res.sendStatus(200);
  } catch (error) {
    if (error.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      console.error("Error response from OpenAI:", error.response.data);
    } else if (error.request) {
      // The request was made but no response was received
      console.error("No response received from OpenAI:", error.request);
    } else {
      // Something happened in setting up the request that triggered an Error
      console.error("Error in setting up OpenAI request:", error.message);
    }
    res.sendStatus(500);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
