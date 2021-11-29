const express = require('express');
const app = express();
const cors = require('cors');
const admin = require("firebase-admin");
require('dotenv').config();
const { MongoClient } = require('mongodb');
const ObjectId = require('mongodb').ObjectId;
const stripe = require('stripe')(process.env.STRIPE_SECRET);
const fileUpload = require('express-fileupload');

const port = process.env.PORT || 5000;

// firbase admin sdk for jwt
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(fileUpload());


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.bdgqc.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });

async function verifyToken(req,res,next){
if(req.headers?.authorization?.startsWith('Bearer')){
  const token = req.headers.authorization.split(' ')[1];
  try{
    const decodedUser = await admin.auth().verifyIdToken(token);
    req.decodedEmail = decodedUser.email;
  }
  catch{

  }
}
  next();
}

async function run(){
try{
await client.connect();
const database = client.db('doctors_portal');
const appointmentsCollection = database.collection('appointments');
const usersCollection = database.collection('users');
const doctorsCollection= database.collection('doctors');

// get data from the server 
app.get('/appointments', verifyToken, async(req,res)=>{
  const email = req.query.email;
  const date =  req.query.date;
  const query = {email:email, date:date}
  const cursor = appointmentsCollection.find(query);
  const appointments = await cursor.toArray();
  res.json(appointments);
})
// get appointments information using id 
app.get('/appointments/:id', async (req,res)=>{
  const id = req.params.id;
  const query = {_id: ObjectId(id)};
  const result = await appointmentsCollection.findOne(query);
  res.json(result);

})
// post data to the database 
app.post('/appointments', async (req,res)=>{
  const appointment = req.body;
     const result = await appointmentsCollection.insertOne(appointment)
  res.json(result)

});
// update payment appointment id 
app.put('/appointments/:id', async (req,res)=>{
  const id = req.params.id;
  const payment = req.body;
  const filter = {_id: ObjectId(id)};
  const updateDoc={
    $set:{
      payment:payment

    }
  };
  const result = await appointmentsCollection.updateOne(filter,updateDoc);
  res.json(result);
})
//get doctors ingo from db 
app.get('/doctors', async (req,res)=>{
  const cursor = doctorsCollection.find({});
  const doctors = await cursor.toArray();
  res.json(doctors)
})

// Add doctors using profile image to db 
app.post('/doctors', async(req,res)=>{
  const name = req.body.name;
  const email= req.body.email;
  const pic = req.files.image;
  const picData = pic.data;
  const encodedPic = picData.toString('base64');
  const imageBuffer = Buffer.from(encodedPic,'base64');
  const doctor ={
    name,
    email,
    image:imageBuffer
  }
 const result= await doctorsCollection.insertOne(doctor)
  res.json(result)
})

// special user data get 
app.get('/users/:email',async(req,res)=>{
  const email = req.params.email;
  const query = {email:email};
  const user = await usersCollection.findOne(query);
  let isAdmin = false ;
  if(user?.role ==='admin'){
    isAdmin = true;
  }
  res.json({admin: isAdmin});
})
//post users to the database 

app.post('/users', async (req,res)=>{
  const user = req.body;
     const result = await usersCollection.insertOne(user);
  res.json(result);
});
// upsert exist user dont create new one 
app.put('/users', async(req,res)=>{
  const user = req.body;
  const filter = {email: user.email};
  const options = {upsert: true};
  const updateDoc = {$set: user};
  const result = await usersCollection.updateOne(filter,updateDoc,options);
  res.json(result);
});
app.put('/users/admin', verifyToken, async(req,res)=>{
  const user = req.body;
  const requester = req.decodedEmail;
  if(requester){
    const requsterAccount = await usersCollection.findOne({email: requester});
    if(requsterAccount.role==='admin'){
      const filter ={email: user.email};
      const updateDoc ={$set: {role: 'admin'}};
      const result = await usersCollection.updateOne(filter,updateDoc);
      res.json(result);

    }
  }
  else{
    res.status(403).json({message:'You do not have access to make admin'})
  }

})
// payment 
app.post('/create-payment-intent', async (req,res)=>{
  const paymentInfo = req.body;
  const amount = paymentInfo.price*100;
  const paymentIntent = await stripe.paymentIntents.create({
    currency:'usd',
    amount:amount,
    payment_method_types:['card']
  });
  res.json({clientSecret: paymentIntent.client_secret})
})
}
finally{
//  await client.close();
}
}
run().catch(console.dir)

app.get('/', (req, res) => {
  res.send('Hello Doctors Portal')
})

app.listen(port, () => {
  console.log(`listening at ${port}`)
})

// app.get('/users')
// app.post('/users')
// app.get('/users/:id')
// app.put('/users/:id')
// app.delete('/users/:id')