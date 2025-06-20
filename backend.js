/*
  Backend for Mindify: Mental Health Website
  Features implemented:
    - Anonymous Forum (create, fetch, reply)
    - Self-Assessment Tests (list, structure, submission)
*/

require('dotenv').config();
console.log('MONGO_URI:', process.env.MONGO_URI);
const fetch = require('node-fetch');
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
app.use(cors());
app.use(bodyParser.json());

// ------------------ DATABASE CONNECTION ------------------
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const db = mongoose.connection;
db.on('error', console.error.bind(console, 'connection error:'));
db.once('open', () => console.log('Connected to MongoDB'));

// ------------------ SCHEMAS ------------------
const ReplySchema = new mongoose.Schema({
  message: String,
  timestamp: { type: Date, default: Date.now },
});

const PostSchema = new mongoose.Schema({
  title: String,
  content: String,
  anonymousId: String,
  timestamp: { type: Date, default: Date.now },
  replies: [ReplySchema],
});

const TestSchema = new mongoose.Schema({
  title: String,
  description: String,
  questions: [
    {
      question: String,
      options: [
        {
          text: String,
          score: Number,
        },
      ],
    },
  ],
});

const TestResultSchema = new mongoose.Schema({
  testId: mongoose.Schema.Types.ObjectId,
  anonymousId: String,
  answers: [Number],
  score: Number,
  resultSummary: String,
  timestamp: { type: Date, default: Date.now },
});

const Post = mongoose.model('Post', PostSchema);
const Test = mongoose.model('Test', TestSchema);
const TestResult = mongoose.model('TestResult', TestResultSchema);

// ------------------ ROUTES ------------------
// Forum Routes
app.post('/posts', async (req, res) => {
  const { title, content, anonymousId } = req.body;
  const post = new Post({ title, content, anonymousId });
  await post.save();
  res.status(201).json(post);
});

app.get('/posts', async (req, res) => {
  const posts = await Post.find().sort({ timestamp: -1 });
  res.json(posts);
});

app.get('/posts/:id', async (req, res) => {
  const post = await Post.findById(req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found' });
  res.json(post);
});

app.post('/posts/:id/reply', async (req, res) => {
  const { message } = req.body;
  const post = await Post.findById(req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found' });
  post.replies.push({ message });
  await post.save();
  res.status(201).json(post);
});

// Self-Assessment Test Routes
app.get('/tests', async (req, res) => {
  const tests = await Test.find({}, 'title description');
  res.json(tests);
});

app.get('/tests/:id', async (req, res) => {
  const test = await Test.findById(req.params.id);
  if (!test) return res.status(404).json({ error: 'Test not found' });
  res.json(test);
});

app.post('/tests/:id/submit', async (req, res) => {
  const { answers, anonymousId } = req.body;
  const test = await Test.findById(req.params.id);
  if (!test) return res.status(404).json({ error: 'Test not found' });

  let totalScore = 0;
  test.questions.forEach((q, i) => {
    const selectedOption = q.options[answers[i]];
    if (selectedOption) totalScore += selectedOption.score;
  });

  // Example scoring logic (replace with your own)
  let resultSummary = 'Low';
  if (totalScore > 15) resultSummary = 'Moderate';
  if (totalScore > 25) resultSummary = 'High';

  const result = new TestResult({
    testId: test._id,
    anonymousId,
    answers,
    score: totalScore,
    resultSummary,
  });
  await result.save();

  res.json({ score: totalScore, resultSummary });
});


app.post('/chat', async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: 'No message provided.' });

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'mistralai/mistral-7b-instruct', // You can change model here
        messages: [
          { role: 'system', content: 'You are a kind and helpful mental health assistant.' },
          { role: 'user', content: message }
        ]
      })
    });

    const data = await response.json();
    const reply = data?.choices?.[0]?.message?.content || "Sorry, I couldn't respond.";
    res.json({ reply });

  } catch (err) {
    console.error('Chat API error:', err);
    res.status(500).json({ error: 'Failed to fetch AI response.' });
  }
});
// ------------------ START SERVER ------------------
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
