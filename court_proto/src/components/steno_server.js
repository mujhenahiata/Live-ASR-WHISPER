const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bodyParser = require('body-parser');

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/supremecourt', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const app = express();
app.use(cors());
app.use(bodyParser.json());

// User Schema
const UserSchema = new mongoose.Schema({
  name: String,
  email: String,
});

const User = mongoose.model('User', UserSchema);

// Case Schema
const CaseSchema = new mongoose.Schema({
  caseNo: String,
  title: String,
  status: String,
  caseType: String,
  court: String,
  filingDate: Date,
  plaintiffs: [String],
  defendants: [String],
  judge: String,
  collaborators: [String],
});

const Case = mongoose.model('Case', CaseSchema);

// Endpoint to fetch cases for a logged-in user
app.get('/cases', async (req, res) => {
  const { userId } = req.query;
  try {
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const cases = await Case.find({ judge: user.name }); // Filter cases based on the user role.
    res.json(cases);
  } catch (err) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Start Server
const PORT = 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
