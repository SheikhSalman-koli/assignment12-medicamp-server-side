require('dotenv').config()
const express = require('express')
const cors = require('cors')
const app = express()
const port = process.env.PORT || 3000
const { MongoClient, ServerApiVersion } = require('mongodb');


app.use(cors())
app.use(express.json())


const uri = `mongodb+srv://${process.env.DB_NAME}:${process.env.DB_PASS}@cluster0.dclhmji.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();

    const db = client.db('medical-camp')
    const usersCollection = db.collection('users')


    // store logged in users in DB
    app.post('/register', async (req, res) => {
      try {
        const { name, email, photo, role } = req.body;

        if (!email) {
          return res.status(400).json({ message: 'Missing required email' });
        }
        const existingUser = await usersCollection.findOne({ email });
        if (existingUser) {
          return res.status(400).json({ message: 'User already exists' });
        }

        const newUser = {
          name,
          email,
          photo,
          role,
          created_at: new Date().toISOString(),
          last_log_at: new Date().toISOString()
        };

        const result = await usersCollection.insertOne(newUser)
        res.send(result)
        // await newUser.save();
        // res.status(201).json({ message: 'User created successfully', user: newUser });
      } catch (err) {
        res.status(500).json({ message: 'Server error', error: err.message });
      }
    });

    // get role
    app.get('/users/role/:email', async (req, res) => {
      const email = req.params.email;
      const user = await usersCollection.findOne({ email });

      if (!user) {
        return res.status(404).json({ role: 'user' });
      }
      res.send({ role: user?.role || 'user' });
    });



    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    // console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);


app.get('/', (req, res) => {
  res.send('hello from medical camp')
})

app.listen(port, () => {
  console.log(`medical camp is running on port ${port}`);
})