require('dotenv').config()
const express = require('express')
const cors = require('cors')
const jwt = require('jsonwebtoken')
const stripe = require('stripe')(process.env.PAYMENT_SECRET);
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
    const registrationCollection = db.collection('registration')
    const paymentsCollection = db.collection("payments");
    const feedbackCollection = db.collection('feedback')

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
    app.patch('/users/:email',verifyToken, async (req, res) => {
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

    // show 6 height participant camps at home
    app.get('/camps/popular', async (req, res) => {
      try {
        const popularCamps = await campsCollection
          .find()
          .sort({ participantCount: -1 })
          .limit(6)
          .toArray();
        res.send(popularCamps);
      } catch (err) {
        res.status(500).send({ message: 'Server error', error: err.message });
      }
    });

    // show all camps at available page
    app.get('/see/allcamps', async (req, res) => {
      try {
        const { searchParams, sortParams } = req.query
        // console.log(searchParams);
        let query = {}
        if (searchParams) {
          query = {
            $or: [
              { campName: { $regex: searchParams, $options: "i" } },
              { doctor: { $regex: searchParams, $options: "i" } },
              { location: { $regex: searchParams, $options: "i" } },
              { fees: { $regex: searchParams, $options: "i" } },
              { dateTime: { $regex: searchParams, $options: "i" } }
            ]
          }
        }

        let sortQuery = {}
        if (sortParams === 'most-registered') sortQuery = { participantCount: -1 }
        else if (sortParams === 'fees') sortQuery = { fees: -1 }
        else if (sortParams === 'alphabetical') sortQuery = { campName: 1 }

        const popularCamps = await campsCollection.find(query).sort(sortQuery).toArray();
        res.send(popularCamps);
      } catch (err) {
        res.status(500).send({ message: 'Server error', error: err.message });
      }
    });

    // show spesific camp at details page
    app.get('/camp-details/:campId', async (req, res) => {
      try {
        const id = req.params.campId;
        const query = { _id: new ObjectId(id) }
        const campDetails = await campsCollection.findOne(query)
        res.send(campDetails);
      } catch (err) {
        res.status(500).send({ message: 'Server error', error: err.message });
      }
    });

    // create camps
    app.post('/camps',verifyToken, async (req, res) => {
      try {
        const newCamp = req.body;
        const result = await campsCollection.insertOne(newCamp);
        res.send(result);
      } catch (err) {
        res.status(500).json({ message: 'Server error', error: err.message });
      }
    });

    // manage camp
    app.get('/camps',verifyToken, async (req, res) => {
      try {
        const { email, searchParams } = req.query
        const page = parseInt(req?.query.page)
        const size = parseInt(req?.query.size)
        // console.log("QUERY", req.query)
        let query = {}
        if (email && !searchParams) {
          query.created_by = email
        }
        if (searchParams) {
          query.$and = [
            {
              created_by: email
            },
            {
              $or: [
                { campName: { $regex: searchParams, $options: "i" } },
                { doctor: { $regex: searchParams, $options: "i" } },
                { location: { $regex: searchParams, $options: "i" } },
                { fees: { $regex: searchParams, $options: "i" } },
                { dateTime: { $regex: searchParams, $options: "i" } }
              ]
            }
          ]
        }

        // get camp count for pagination
        const total = await campsCollection.countDocuments(query);

        const camps = await campsCollection
          .find(query)
          .skip(page * size)
          .limit(size)
          .toArray();
        res.send(
          {
            total,
            data: camps
          });
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

    // registration by clicking join button & update participateCount
    app.post('/registrations',verifyToken, async (req, res) => {
      const data = req.body;
      const { campId } = req.body
      const result = await registrationCollection.insertOne(data);
      // update participateCount
      if (result?.insertedId) {
        await campsCollection.updateOne(
          { _id: new ObjectId(campId) },
          { $inc: { participantCount: 1 } }
        )
      }
      res.send(result);
    });

    // disable join camp button , if user already joined
    app.get('/registrations/check', async (req, res) => {
      const { campId, email } = req.query;
      const isRegistered = await registrationCollection.findOne({
        campId,
        participantEmail: email,
      });
      res.send({ registered: !!isRegistered });
    });

    // get all registration of logged in user
    app.get('/registrations', verifyToken, async (req, res) => {
      try {
        const { email, searchParams } = req?.query
        const page = parseInt(req?.query.page)
        const size = parseInt(req?.query.size)
        const query = {}
        if (email) {
          query.participantEmail = email
        }
        if (searchParams) {
          query.$and = [
            { participantEmail: email },
            {
              $or: [
                { campName: { $regex: searchParams, $options: "i" } },
                { payment_status: { $regex: searchParams, $options: "i" } },
                { participantName: { $regex: searchParams, $options: "i" } },
                { fees: { $regex: searchParams, $options: "i" } },
                { confirm_status: { $regex: searchParams, $options: "i" } }
              ]
            }
          ]

        }
        const total = await registrationCollection.countDocuments(query)

        const registrations = await registrationCollection
          .find(query)
          .skip(page * size)
          .limit(size)
          .toArray();
        res.send({
          total,
          data: registrations
        });
      } catch (err) {
        res.status(500).send({ message: 'Server error', error: err.message });
      }
    });

    // update confirmation status by admin
    app.patch('/update-confirmation/:id',verifyToken, async (req, res) => {
      const id = req.params.id
      const filter = { _id: new ObjectId(id) }
      const filter2 = { regId: id }
      const updateDoc = {
        $set: { confirm_status: 'confirmed' }
      }
      const updated = await registrationCollection.updateOne(filter, updateDoc)

      if (updated.modifiedCount) {
        await paymentsCollection.updateOne(filter2, updateDoc)
      }
      res.send(updated)
    })

    // delete registration
    app.delete('/registrations/:id',verifyToken, async (req, res) => {
      const id = req.params.id;
      const campId = req?.query?.campId
      const deletedItem = { _id: new ObjectId(id) }
      const result = await registrationCollection.deleteOne(deletedItem);
      // decreament participantCount from campsCollection
      if (result?.deletedCount) {
        await campsCollection.updateOne(
          { _id: new ObjectId(campId) },
          { $inc: { participantCount: -1 } }
        )
      }
      res.send(result);
    });

    // get all registrations for confirmation by admin 
    app.get('/regConfirmation', async (req, res) => {
      const { searchParams } = req?.query
      // console.log(searchParams);
      const page = parseInt(req.query.page)
      const size = parseInt(req.query.size)
      let query = {}
      if (searchParams) {
        query = {
          $or: [
            { campName: { $regex: searchParams, $options: "i" } },
            { doctor: { $regex: searchParams, $options: "i" } },
            { participantName: { $regex: searchParams, $options: "i" } },
            { fees: { $regex: searchParams, $options: "i" } },
            { confirm_status: { $regex: searchParams, $options: "i" } },
            { payment_status: { $regex: searchParams, $options: "i" } }
          ]
        }
      }
      const registrations = await registrationCollection
        .find(query)
        .skip(page * size)
        .limit(size)
        .toArray();
      res.send(registrations);
    });
    // get count of registration for pagination
    app.get('/count', async (req, res) => {
      const totalData = await registrationCollection.estimatedDocumentCount()
      res.send(totalData)
    })


    // get a registration for payment
    app.get('/registration/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) }
      const result = await registrationCollection.findOne(query);
      res.send(result);
    });

    // get all registration for chartData
    app.get('/chartData/:email', async (req, res) => {
      try {
        const email = req?.params.email
        const filter = { participantEmail: email }
        const chartData = await registrationCollection.find(filter).toArray()
        res.send(chartData)
      } catch (err) {
        res.status(404).send({ message: 'email not found' })
      }
    })

    // create payment intent
    app.post('/payment/intent', async (req, res) => {
      const { amountInCents } = req?.body
      const { client_secret } = await stripe.paymentIntents.create({
        amount: amountInCents,
        currency: 'usd',
        automatic_payment_methods: {
          enabled: true
        }
      })
      res.send({ clientSecret: client_secret })
    })

    // save payment history
    app.post('/payments', async (req, res) => {
      try {
        const paymentData = req.body;
        const { regId } = req.body
        const result = await paymentsCollection.insertOne(paymentData);

        if (result?.insertedId) {
          await registrationCollection.updateOne(
            // { campId: regCampId },
            { _id: new ObjectId(regId) },
            { $set: { payment_status: 'paid' } }
          )
        }
        res.send(result);
      } catch (error) {
        res.status(500).json({
          message: 'Failed to record payment',
          error: error.message,
        });
      }
    });

    // payment history of logged is user
    app.get('/payments', async (req, res) => {
      const { email, searchParams } = req?.query
      const page = parseInt(req?.query.page)
      const size = parseInt(req?.query.size)
      // console.log('QUERY', req.query);
      const query = {}
      if (email) {
        query.payerEmail = email
      }
      if (searchParams) {
        query.$and = [
          { payerEmail: email },
          {
            $or: [
              { regCampName: { $regex: searchParams, $options: "i" } },
              { payment_status: { $regex: searchParams, $options: "i" } },
              { transactionId: { $regex: searchParams, $options: "i" } },
              { fees: { $regex: searchParams, $options: "i" } },
              { confirm_status: { $regex: searchParams, $options: "i" } }
            ]
          }
        ]
      }

      const total = await paymentsCollection.countDocuments(query)

      const payments = await paymentsCollection
        .find(query)
        .skip(page * size)
        .limit(size)
        .toArray();

      res.send({
        total,
        data: payments
      })
    });

    // save feedback
    app.post('/feedback', async (req, res) => {
      try {
        const feedback = req.body;
        const result = await feedbackCollection.insertOne(feedback);
        res.send(result);
      } catch (error) {
        res.status(500).json({ message: 'Failed to save feedback', error: error.message });
      }
    });

    // get some latest feedbacks
    app.get('/feedback', async (req, res) => {
      try {
        const feedbacks = await feedbackCollection
          .find()
          .limit(6)
          .sort({ date: -1 })
          .toArray();
        res.send(feedbacks);
      } catch (error) {
        res.status(500).json({ message: 'Failed to fetch feedback', error: error.message });
      }
    });

    // get all feedbacks
    app.get('/feedbackall', async (req, res) => {
      try {
        const feedbacks = await feedbackCollection
          .find()
          .sort({ date: -1 })
          .toArray();
        res.send(feedbacks);
      } catch (error) {
        res.status(500).json({ message: 'Failed to fetch feedback', error: error.message });
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