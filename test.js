require('dotenv').config(); // Load environment variables from .env file

const express = require('express');
const bodyParser = require('body-parser');
const request = require('request');

const { Configuration, OpenAIApi } = require("openai");

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});

const openai = new OpenAIApi(configuration);

const app = express();
const port = process.env.PORT || 4000;

app.use(bodyParser.json());

// Endpoint for the chatbot home page
app.get('/', (req, res) => {
  res.send('Welcome to the Unsplash Chatbot for Zoom!');
});

// Endpoint for authorizing the bot to send messages
app.get('/authorize', (req, res) => {
  console.log('authorized');
  res.redirect('https://zoom.us/launch/chat?jid=robot_' + process.env.zoom_bot_jid);
});

// Endpoint for support information
app.get('/support', (req, res) => {
  res.send('See Zoom Developer Support for help.');
});

// Endpoint for privacy policy
app.get('/privacy', (req, res) => {
  res.send('The Unsplash Chatbot for Zoom does not store any user data.');
});

// Endpoint for terms of service
app.get('/terms', (req, res) => {
  res.send('By installing the Unsplash Chatbot for Zoom, you accept and agree to these terms...');
});

// Endpoint for documentation
app.get('/documentation', (req, res) => {
  res.send('Try typing "island" to see a photo of an island, or anything else you have in mind!');
});

// Endpoint for Zoom verification
app.get('/zoomverify/verifyzoom.html', (req, res) => {
  res.send(process.env.zoom_verification_code);
});

// Endpoint for receiving messages and sending responses
app.post('/unsplash', async (req, res) => {
  // First, we need to retrieve the bot's access token for sending messages via the Zoom API
  const chatbotToken = await getChatbotToken();

  // Next, we extract the user's message from the incoming payload
  const chatMessage = req.body.payload.cmd;

  // Now, we can use the OpenAI API to generate a response based on the user's message
  const response = await generateResponse(chatMessage);

  // Finally, we send the response back to the user via the Zoom API
  await sendChat(chatMessage, response, chatbotToken, req.body.payload);

  // Return a success response to the user
  res.sendStatus(200);
});

async function getChatbotToken() {
  return new Promise((resolve, reject) => {
    request({
      url: 'https://api.zoom.us/oauth/token?grant_type=client_credentials',
      method: 'POST',
      headers: {
        'Authorization': `Basic ${Buffer.from(
          `${process.env.zoom_client_id}:${process.env.zoom_client_secret}`,
        ).toString('base64')}`,
      },
    }, (error, httpResponse, body) => {
      if (error) {
        console.error(`Error getting chatbot_token from Zoom: ${error}`);
        reject(error);
      } else {
        body = JSON.parse(body);
        resolve(body.access_token);
      }
    });
  });
}

async function generateResponse(userMessage) {
  const prompt = `User: ${userMessage}\nBot:`;
  const completion = await openai.createCompletion({
    model: "text-davinci-002",
    prompt,
    maxTokens: 256,
    n: 1,
    stop: "\n",
  });
  const response = completion.data.choices[0].text.trim();
  return response;
}

async function sendChat(userMessage, botMessage, chatbotToken, payload) {
  const messageContent = {
    'head': {
      'text': 'Unsplash'
    },
    'body': [{
      'type': 'message',
      'text': `You said: ${userMessage}\n\n${botMessage}`
    }],
  };

  const requestBody = {
    robot_jid: process.env.zoom_bot_jid,
    to_jid: payload.toJid,
    account_id: payload.accountId,
    user_jid: payload.userJid,
    content: messageContent,
  };

  await request({
    url: 'https://api.zoom.us/v2/im/chat/messages',
    method: 'POST',
    json: true,
    body: requestBody,
    headers: {
      'Authorization': `Bearer ${chatbotToken}`,
      'Content-Type': 'application/json',
    },
  });
}

app.post('/deauthorize', (req, res) => {
  if (req.headers.authorization === process.env.zoom_verification_token) {
    res.status(200)
    res.send()
    request({
      url: 'https://api.zoom.us/oauth/data/compliance',
      method: 'POST',
      json: true,
      body: {
        'client_id': req.body.payload.client_id,
        'user_id': req.body.payload.user_id,
        'account_id': req.body.payload.account_id,
        'deauthorization_event_received': req.body.payload,
        'compliance_completed': true
      },
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Basic ' + Buffer.from(process.env.zoom_client_id + ':' + process.env.zoom_client_secret).toString('base64'),
        'cache-control': 'no-cache'
      }
    }, (error, httpResponse, body) => {
      if (error) {
        console.log(error)
      } else {
        console.log(body)
      }
    })
  } else {
    res.status(401)
    res.send('Unauthorized request to Unsplash Chatbot for Zoom.')
  }
})

app.listen(port, () => console.log(`Unsplash Chatbot for Zoom listening on port ${port}!`))