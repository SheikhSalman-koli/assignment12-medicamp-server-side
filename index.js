require('dotenv').config()
const express = require('express')
const cors = require('cors')
const jwt = require('jsonwebtoken')
const app = express()
const port = process.env.PORT || 3000
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');


app.use(cors())
app.use(express.json())


const verifyToken = async (req, res, next) => {
  const authHeader = req?.headers?.authorization;
  if (!authHeader) {
    return res.status(401).send({ message: 'unauthorized access' });
  }
  const token = authHeader.split(' ')[1];
  if (!token) return res.status(401).send({ message: 'unauthorized access' })
  jwt.verify(token, process.env.JWT_SECRET_KEY, (error, decoded) => {
    if (error) {
      return res.status(401).send({ message: 'unauthorized access' })
    }
    req.email === decoded.email
    next()
  })

}

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
    const campsCollection = db.collection('camps')

    // const verifyAdmin

    // generate jwt
    app.post('/jwt', (req, res) => {
      const user = { email: req.body.email }
      // generet token
      const token = jwt.sign(user, process.env.JWT_SECRET_KEY, {
        expiresIn: '1d'
      })
      res.send({ token, message: 'token created successfully!' })
    })

    // store logged in users in DB
    app.post('/register', async (req, res) => {
      try {
        const { name, email, photo, role } = req.body;
        if (!email) {
          return res.status(400).json({ message: 'Missing required email' });
        }
        const existingUser = await usersCollection.findOne({ email });
        if (existingUser) {
          const result = await usersCollection.updateOne({ email }, {
            $set: { last_log_at: new Date().toISOString() }
          })
          return res.send(result)
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

    // get organizer/user for update
    app.get('/users/:email', verifyToken, async (req, res) => {
      try {
        const email = req.params.email;
        const user = await usersCollection.findOne({ email });
        if (!user) {
          return res.status(404).json({ message: 'User not found' });
        }
        res.send(user);
      } catch (err) {
        res.status(500).json({ message: 'Server error', error: err.message });
      }
    });

    // update user/organizer profile
    app.patch('/users/:email', async (req, res) => {
      try {
        const email = req.params.email;
        const { name, photo, contact } = req.body;
        const filter = { email };
        const update = {
          $set: {
            name,
            photo,
            contact
          },
        };
        const options = { upsert: true };
        const result = await usersCollection.updateOne(filter, update, options);
        res.send(result);
      } catch (err) {
        res.status(500).json({ message: 'Server error', error: err.message });
      }
    });


    // create camps
    app.post('/camps', async (req, res) => {
      try {
        const newCamp = req.body;
        const result = await campsCollection.insertOne(newCamp);
        res.send(result);
      } catch (err) {
        res.status(500).json({ message: 'Server error', error: err.message });
      }
    });

    // manage camp
    app.get('/camps', async (req, res) => {
      try {
        const email = req.query.email;
        const query = { created_by: email }
        const camps = await campsCollection.find(query).toArray();
        res.send(camps);
      } catch (err) {
        res.status(500).send({ message: 'Server error', error: err.message });
      }
    });

    // delete camp
    app.delete('/camps/:id', verifyToken, async (req, res) => {
      try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) }
        const result = await campsCollection.deleteOne(query);
        res.send(result);
      } catch (err) {
        res.status(500).send({ message: 'Server error', error: err.message });
      }
    });

    // update camp
    app.patch('/camps/:id', verifyToken, async (req, res) => {
      try {
        const id = req.params.id;
        const filter = { _id: new ObjectId(id) }
        const updateData = req.body;
        const updateDoc =
        {
          $set: {
            ...updateData,
            // updated_at: new Date().toISOString(),
          },
        }
        const result = await campsCollection.updateOne(filter, updateDoc);
        res.send(result);
      } catch (err) {
        res.status(500).send({ message: 'Server error', error: err.message });
      }
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