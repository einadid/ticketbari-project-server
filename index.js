const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// ============ ROOT ROUTE ============
app.get('/', (req, res) => {
  res.send('🎫 TicketBari Server is Running!');
});

// MongoDB URI
const uri = process.env.MONGODB_URI;

console.log("🔄 Connecting to MongoDB...");
console.log("DB_USER:", process.env.DB_USER ? "Found ✅" : "Missing ❌");
console.log("DB_PASS:", process.env.DB_PASS ? "Found ✅" : "Missing ❌");

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
  tls: true,
  tlsAllowInvalidCertificates: true,
  tlsAllowInvalidHostnames: true,
});

// ============ DATABASE & COLLECTIONS ============
let usersCollection;
let ticketsCollection;
let bookingsCollection;
let paymentsCollection;

async function run() {
  try {
    await client.connect();
    console.log("✅ Connected to MongoDB!");

    const database = client.db("ticketBariDB");
    usersCollection = database.collection("users");
    ticketsCollection = database.collection("tickets");
    bookingsCollection = database.collection("bookings");
    paymentsCollection = database.collection("payments");

    console.log("✅ Database collections ready!");

  } catch (error) {
    console.error("❌ MongoDB Connection Error:", error.message);
  }
}

run();

// ==================== JWT ROUTE ====================
app.post('/jwt', async (req, res) => {
  try {
    const user = req.body;
    console.log("📥 JWT Request for:", user.email);
    
    const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET || 'fallback-secret-key', { 
      expiresIn: '7d' 
    });
    
    console.log("✅ Token generated successfully");
    res.send({ token });
  } catch (error) {
    console.error("❌ JWT Error:", error.message);
    res.status(500).send({ error: error.message });
  }
});

// ==================== MIDDLEWARE ====================
const verifyToken = (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res.status(401).send({ message: 'Unauthorized access' });
  }
  const token = authorization.split(' ')[1];
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET || 'fallback-secret-key', (err, decoded) => {
    if (err) {
      return res.status(401).send({ message: 'Unauthorized access' });
    }
    req.decoded = decoded;
    next();
  });
};

// Verify Admin
const verifyAdmin = async (req, res, next) => {
  const email = req.decoded.email;
  const user = await usersCollection.findOne({ email: email });
  if (user?.role !== 'admin') {
    return res.status(403).send({ message: 'Forbidden access' });
  }
  next();
};

// Verify Vendor
const verifyVendor = async (req, res, next) => {
  const email = req.decoded.email;
  const user = await usersCollection.findOne({ email: email });
  if (user?.role !== 'vendor') {
    return res.status(403).send({ message: 'Forbidden access' });
  }
  next();
};

// ==================== PUBLIC STATS ROUTE ====================
app.get('/public-stats', async (req, res) => {
  try {
    const totalUsers = await usersCollection.countDocuments();
    const bookings = await bookingsCollection.find().toArray();
    const totalTicketsSold = bookings.reduce((sum, booking) => sum + (booking.bookingQuantity || 0), 0);
    const tickets = await ticketsCollection.find({}, { projection: { fromLocation: 1, toLocation: 1 } }).toArray();
    const routes = new Set(tickets.map(t => `${t.fromLocation}-${t.toLocation}`));
    const totalRoutes = routes.size;
    const successfulBookings = await bookingsCollection.countDocuments({ status: 'paid' });
    const totalBookings = await bookingsCollection.countDocuments();
    const satisfactionRate = totalBookings > 0 ? Math.round((successfulBookings / totalBookings) * 100) : 98;
    const totalVendors = await usersCollection.countDocuments({ role: 'vendor' });
    const totalTickets = await ticketsCollection.countDocuments({ verificationStatus: 'approved' });

    res.send({
      totalUsers,
      totalTicketsSold,
      totalRoutes,
      satisfactionRate,
      totalVendors,
      totalTickets
    });
  } catch (error) {
    console.error("❌ Public Stats Error:", error.message);
    res.status(500).send({ error: error.message });
  }
});

// ==================== USER ROUTES ====================

// Save user to database
app.post('/users', async (req, res) => {
  try {
    const user = req.body;
    const query = { email: user.email };
    const existingUser = await usersCollection.findOne(query);
    
    if (existingUser) {
      return res.send({ message: 'User already exists', insertedId: null });
    }
    
    const result = await usersCollection.insertOne(user);
    res.send(result);
  } catch (error) {
    res.status(500).send({ error: error.message });
  }
});

// Get all users (Admin only)
app.get('/users', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const result = await usersCollection.find().toArray();
    res.send(result);
  } catch (error) {
    res.status(500).send({ error: error.message });
  }
});

// Get user role
app.get('/users/role/:email', verifyToken, async (req, res) => {
  try {
    const email = req.params.email;
    
    if (email !== req.decoded.email) {
      return res.status(403).send({ message: 'Forbidden access' });
    }
    
    const user = await usersCollection.findOne({ email: email });
    let role = 'user';
    if (user?.role) {
      role = user.role;
    }
    res.send({ role });
  } catch (error) {
    res.status(500).send({ error: error.message });
  }
});

// Get user by email with full details
app.get('/users/details/:email', verifyToken, async (req, res) => {
  try {
    const email = req.params.email;
    
    if (email !== req.decoded.email) {
      return res.status(403).send({ message: 'Forbidden access' });
    }
    
    const result = await usersCollection.findOne({ email: email });
    res.send(result);
  } catch (error) {
    res.status(500).send({ error: error.message });
  }
});

// Update user profile (comprehensive)
app.patch('/users/update/:email', verifyToken, async (req, res) => {
  try {
    const email = req.params.email;
    const { name, phone, photo, address } = req.body;
    
    if (email !== req.decoded.email) {
      return res.status(403).send({ message: 'Forbidden access' });
    }

    const filter = { email: email };
    const updateDoc = {
      $set: {
        ...(name && { name }),
        ...(phone && { phone }),
        ...(photo && { photo }),
        ...(address && { address }),
        updatedAt: new Date().toISOString()
      }
    };
    
    const result = await usersCollection.updateOne(filter, updateDoc);
    res.send(result);
  } catch (error) {
    res.status(500).send({ error: error.message });
  }
});

// Get single user by email
app.get('/users/:email', verifyToken, async (req, res) => {
  try {
    const email = req.params.email;
    const result = await usersCollection.findOne({ email: email });
    res.send(result);
  } catch (error) {
    res.status(500).send({ error: error.message });
  }
});

// Update user photo by email
app.patch('/users/:email', verifyToken, async (req, res) => {
  try {
    const email = req.params.email;
    const { photo } = req.body;
    
    if (email !== req.decoded.email) {
      return res.status(403).send({ message: 'Forbidden access' });
    }

    const filter = { email: email };
    const updateDoc = {
      $set: {
        photo: photo,
        photoUpdatedAt: new Date().toISOString()
      }
    };
    
    const result = await usersCollection.updateOne(filter, updateDoc);
    res.send(result);
  } catch (error) {
    res.status(500).send({ error: error.message });
  }
});

// Update user profile (PUT)
app.put('/users/:email', verifyToken, async (req, res) => {
  try {
    const email = req.params.email;
    const updateData = req.body;
    
    if (email !== req.decoded.email) {
      return res.status(403).send({ message: 'Forbidden access' });
    }

    const filter = { email: email };
    const updateDoc = {
      $set: {
        ...updateData,
        updatedAt: new Date().toISOString()
      }
    };
    
    const result = await usersCollection.updateOne(filter, updateDoc);
    res.send(result);
  } catch (error) {
    res.status(500).send({ error: error.message });
  }
});

// Update user role (Admin only)
app.patch('/users/role/:id', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    const { role } = req.body;
    const filter = { _id: new ObjectId(id) };
    const updateDoc = {
      $set: { role: role }
    };
    const result = await usersCollection.updateOne(filter, updateDoc);
    res.send(result);
  } catch (error) {
    res.status(500).send({ error: error.message });
  }
});

// Mark vendor as fraud (Admin only)
app.patch('/users/fraud/:id', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    const filter = { _id: new ObjectId(id) };
    const updateDoc = {
      $set: { 
        isFraud: true,
        fraudMarkedAt: new Date().toISOString()
      }
    };
    const result = await usersCollection.updateOne(filter, updateDoc);
    
    const user = await usersCollection.findOne(filter);
    if (user) {
      await ticketsCollection.updateMany(
        { vendorEmail: user.email },
        { $set: { isHidden: true } }
      );
    }
    
    res.send(result);
  } catch (error) {
    res.status(500).send({ error: error.message });
  }
});

// ==================== TICKET ROUTES ====================

// Add new ticket (Vendor only)
app.post('/tickets', verifyToken, verifyVendor, async (req, res) => {
  try {
    const ticket = req.body;
    
    const vendor = await usersCollection.findOne({ email: ticket.vendorEmail });
    if (vendor?.isFraud) {
      return res.status(403).send({ message: 'Fraud vendors cannot add tickets' });
    }
    
    const ticketData = {
      ...ticket,
      verificationStatus: 'pending',
      isAdvertised: false,
      isHidden: false,
      createdAt: new Date().toISOString()
    };
    
    const result = await ticketsCollection.insertOne(ticketData);
    res.send(result);
  } catch (error) {
    res.status(500).send({ error: error.message });
  }
});

// ✅ FIXED: Get all approved tickets (Public) - WITH FROM/TO FILTER
app.get('/tickets', async (req, res) => {
  try {
    const { search, from, to, transportType, sortPrice, page = 1, limit = 9 } = req.query;
    
    let query = { 
      verificationStatus: 'approved',
      isHidden: { $ne: true }
    };
    
    // ✅ From Location Filter (case-insensitive)
    if (from) {
      query.fromLocation = { $regex: from, $options: 'i' };
    }
    
    // ✅ To Location Filter (case-insensitive)
    if (to) {
      query.toLocation = { $regex: to, $options: 'i' };
    }
    
    // Search by from-to location or title
    if (search) {
      query.$or = [
        { fromLocation: { $regex: search, $options: 'i' } },
        { toLocation: { $regex: search, $options: 'i' } },
        { title: { $regex: search, $options: 'i' } }
      ];
    }
    
    // Filter by transport type
    if (transportType && transportType !== 'all') {
      query.transportType = transportType;
    }
    
    // Sorting
    let sortOption = { createdAt: -1 };
    if (sortPrice === 'lowToHigh') {
      sortOption = { price: 1 };
    } else if (sortPrice === 'highToLow') {
      sortOption = { price: -1 };
    }
    
    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const tickets = await ticketsCollection
      .find(query)
      .sort(sortOption)
      .skip(skip)
      .limit(parseInt(limit))
      .toArray();
    
    const total = await ticketsCollection.countDocuments(query);
    
    console.log(`📍 Filter: from=${from || 'all'}, to=${to || 'all'}, transport=${transportType || 'all'}, found=${total} tickets`);
    
    res.send({
      tickets,
      totalPages: Math.ceil(total / parseInt(limit)),
      currentPage: parseInt(page),
      total
    });
  } catch (error) {
    console.error("❌ Tickets Error:", error.message);
    res.status(500).send({ error: error.message });
  }
});

// Get advertised tickets (Homepage)
app.get('/tickets/advertised', async (req, res) => {
  try {
    const query = { 
      isAdvertised: true, 
      verificationStatus: 'approved',
      isHidden: { $ne: true }
    };
    const result = await ticketsCollection.find(query).limit(6).toArray();
    res.send(result);
  } catch (error) {
    res.status(500).send({ error: error.message });
  }
});

// Get latest tickets (Homepage)
app.get('/tickets/latest', async (req, res) => {
  try {
    const query = { 
      verificationStatus: 'approved',
      isHidden: { $ne: true }
    };
    const result = await ticketsCollection
      .find(query)
      .sort({ createdAt: -1 })
      .limit(8)
      .toArray();
    res.send(result);
  } catch (error) {
    res.status(500).send({ error: error.message });
  }
});

// Get single ticket by ID
app.get('/tickets/:id', verifyToken, async (req, res) => {
  try {
    const id = req.params.id;
    const result = await ticketsCollection.findOne({ _id: new ObjectId(id) });
    res.send(result);
  } catch (error) {
    res.status(500).send({ error: error.message });
  }
});

// Get tickets by vendor email
app.get('/tickets/vendor/:email', verifyToken, verifyVendor, async (req, res) => {
  try {
    const email = req.params.email;
    const result = await ticketsCollection.find({ vendorEmail: email }).toArray();
    res.send(result);
  } catch (error) {
    res.status(500).send({ error: error.message });
  }
});

// Update ticket (Vendor only)
app.patch('/tickets/:id', verifyToken, verifyVendor, async (req, res) => {
  try {
    const id = req.params.id;
    const updatedTicket = req.body;
    const filter = { _id: new ObjectId(id) };
    
    const existingTicket = await ticketsCollection.findOne(filter);
    if (existingTicket?.verificationStatus === 'rejected') {
      return res.status(403).send({ message: 'Cannot update rejected tickets' });
    }
    
    const updateDoc = {
      $set: {
        ...updatedTicket,
        updatedAt: new Date().toISOString()
      }
    };
    const result = await ticketsCollection.updateOne(filter, updateDoc);
    res.send(result);
  } catch (error) {
    res.status(500).send({ error: error.message });
  }
});

// Delete ticket (Vendor only)
app.delete('/tickets/:id', verifyToken, verifyVendor, async (req, res) => {
  try {
    const id = req.params.id;
    const filter = { _id: new ObjectId(id) };
    
    const existingTicket = await ticketsCollection.findOne(filter);
    if (existingTicket?.verificationStatus === 'rejected') {
      return res.status(403).send({ message: 'Cannot delete rejected tickets' });
    }
    
    const result = await ticketsCollection.deleteOne(filter);
    res.send(result);
  } catch (error) {
    res.status(500).send({ error: error.message });
  }
});

// Get all tickets for admin
app.get('/admin/tickets', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const result = await ticketsCollection.find().toArray();
    res.send(result);
  } catch (error) {
    res.status(500).send({ error: error.message });
  }
});

// Update ticket verification status (Admin only)
app.patch('/admin/tickets/:id', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    const { verificationStatus } = req.body;
    const filter = { _id: new ObjectId(id) };
    const updateDoc = {
      $set: { 
        verificationStatus: verificationStatus,
        verifiedAt: new Date().toISOString()
      }
    };
    const result = await ticketsCollection.updateOne(filter, updateDoc);
    res.send(result);
  } catch (error) {
    res.status(500).send({ error: error.message });
  }
});

// Toggle advertise ticket (Admin only)
app.patch('/admin/tickets/advertise/:id', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    const { isAdvertised } = req.body;
    
    if (isAdvertised) {
      const advertisedCount = await ticketsCollection.countDocuments({ isAdvertised: true });
      if (advertisedCount >= 6) {
        return res.status(400).send({ message: 'Cannot advertise more than 6 tickets' });
      }
    }
    
    const filter = { _id: new ObjectId(id) };
    const updateDoc = {
      $set: { isAdvertised: isAdvertised }
    };
    const result = await ticketsCollection.updateOne(filter, updateDoc);
    res.send(result);
  } catch (error) {
    res.status(500).send({ error: error.message });
  }
});

// ==================== BOOKING ROUTES ====================

// Create new booking
app.post('/bookings', verifyToken, async (req, res) => {
  try {
    const booking = req.body;
    
    const ticket = await ticketsCollection.findOne({ 
      _id: new ObjectId(booking.ticketId) 
    });
    
    if (!ticket) {
      return res.status(404).send({ message: 'Ticket not found' });
    }
    
    if (ticket.ticketQuantity < booking.bookingQuantity) {
      return res.status(400).send({ message: 'Not enough tickets available' });
    }
    
    const departureTime = new Date(ticket.departureDateTime);
    if (departureTime < new Date()) {
      return res.status(400).send({ message: 'Cannot book - departure time has passed' });
    }
    
    const bookingData = {
      ...booking,
      status: 'pending',
      createdAt: new Date().toISOString()
    };
    
    const result = await bookingsCollection.insertOne(bookingData);
    res.send(result);
  } catch (error) {
    res.status(500).send({ error: error.message });
  }
});

// Get user's bookings
app.get('/bookings/user/:email', verifyToken, async (req, res) => {
  try {
    const email = req.params.email;
    
    if (email !== req.decoded.email) {
      return res.status(403).send({ message: 'Forbidden access' });
    }
    
    const result = await bookingsCollection
      .find({ userEmail: email })
      .sort({ createdAt: -1 })
      .toArray();
    res.send(result);
  } catch (error) {
    res.status(500).send({ error: error.message });
  }
});

// Get vendor's booking requests
app.get('/bookings/vendor/:email', verifyToken, verifyVendor, async (req, res) => {
  try {
    const email = req.params.email;
    const result = await bookingsCollection
      .find({ vendorEmail: email })
      .sort({ createdAt: -1 })
      .toArray();
    res.send(result);
  } catch (error) {
    res.status(500).send({ error: error.message });
  }
});

// Accept booking (Vendor)
app.patch('/bookings/accept/:id', verifyToken, verifyVendor, async (req, res) => {
  try {
    const id = req.params.id;
    const filter = { _id: new ObjectId(id) };
    const updateDoc = {
      $set: { 
        status: 'accepted',
        acceptedAt: new Date().toISOString()
      }
    };
    const result = await bookingsCollection.updateOne(filter, updateDoc);
    res.send(result);
  } catch (error) {
    res.status(500).send({ error: error.message });
  }
});

// Reject booking (Vendor)
app.patch('/bookings/reject/:id', verifyToken, verifyVendor, async (req, res) => {
  try {
    const id = req.params.id;
    const filter = { _id: new ObjectId(id) };
    const updateDoc = {
      $set: { 
        status: 'rejected',
        rejectedAt: new Date().toISOString()
      }
    };
    const result = await bookingsCollection.updateOne(filter, updateDoc);
    res.send(result);
  } catch (error) {
    res.status(500).send({ error: error.message });
  }
});

// Cancel booking (User)
app.patch('/bookings/cancel/:id', verifyToken, async (req, res) => {
  try {
    const id = req.params.id;
    const booking = await bookingsCollection.findOne({ _id: new ObjectId(id) });
    
    if (booking.status !== 'pending') {
      return res.status(400).send({ message: 'Can only cancel pending bookings' });
    }
    
    const filter = { _id: new ObjectId(id) };
    const updateDoc = {
      $set: { 
        status: 'cancelled',
        cancelledAt: new Date().toISOString()
      }
    };
    const result = await bookingsCollection.updateOne(filter, updateDoc);
    res.send(result);
  } catch (error) {
    res.status(500).send({ error: error.message });
  }
});

// ==================== PAYMENT ROUTES ====================

// Create payment intent (Stripe)
app.post('/create-payment-intent', verifyToken, async (req, res) => {
  try {
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    const { amount } = req.body;
    const amountInCents = parseInt(amount * 100);
    
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInCents,
      currency: 'usd',
      payment_method_types: ['card']
    });
    
    res.send({
      clientSecret: paymentIntent.client_secret
    });
  } catch (error) {
    res.status(500).send({ error: error.message });
  }
});

// Save payment
app.post('/payments', verifyToken, async (req, res) => {
  try {
    const payment = req.body;
    
    const paymentData = {
      ...payment,
      paymentDate: new Date().toISOString()
    };
    const paymentResult = await paymentsCollection.insertOne(paymentData);
    
    const bookingFilter = { _id: new ObjectId(payment.bookingId) };
    const bookingUpdate = {
      $set: { 
        status: 'paid',
        paidAt: new Date().toISOString(),
        transactionId: payment.transactionId
      }
    };
    await bookingsCollection.updateOne(bookingFilter, bookingUpdate);
    
    const ticketFilter = { _id: new ObjectId(payment.ticketId) };
    const ticketUpdate = {
      $inc: { ticketQuantity: -payment.bookingQuantity }
    };
    await ticketsCollection.updateOne(ticketFilter, ticketUpdate);
    
    res.send(paymentResult);
  } catch (error) {
    res.status(500).send({ error: error.message });
  }
});

// Get user's payment history
app.get('/payments/:email', verifyToken, async (req, res) => {
  try {
    const email = req.params.email;
    
    if (email !== req.decoded.email) {
      return res.status(403).send({ message: 'Forbidden access' });
    }
    
    const result = await paymentsCollection
      .find({ userEmail: email })
      .sort({ paymentDate: -1 })
      .toArray();
    res.send(result);
  } catch (error) {
    res.status(500).send({ error: error.message });
  }
});

// ==================== STATS ROUTES ====================

// Get vendor stats
app.get('/vendor/stats/:email', verifyToken, verifyVendor, async (req, res) => {
  try {
    const email = req.params.email;
    
    const payments = await paymentsCollection.find({ vendorEmail: email }).toArray();
    const totalRevenue = payments.reduce((sum, payment) => sum + payment.amount, 0);
    const totalTicketsSold = payments.reduce((sum, payment) => sum + payment.bookingQuantity, 0);
    const totalTicketsAdded = await ticketsCollection.countDocuments({ vendorEmail: email });
    
    res.send({
      totalRevenue,
      totalTicketsSold,
      totalTicketsAdded
    });
  } catch (error) {
    res.status(500).send({ error: error.message });
  }
});

// Get admin stats
app.get('/admin/stats', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const totalUsers = await usersCollection.countDocuments();
    const totalVendors = await usersCollection.countDocuments({ role: 'vendor' });
    const totalTickets = await ticketsCollection.countDocuments();
    const totalBookings = await bookingsCollection.countDocuments();
    
    const revenueResult = await paymentsCollection.aggregate([
      { $group: { _id: null, total: { $sum: "$amount" } } }
    ]).toArray();
    
    res.send({
      totalUsers,
      totalVendors,
      totalTickets,
      totalBookings,
      totalRevenue: revenueResult[0]?.total || 0
    });
  } catch (error) {
    res.status(500).send({ error: error.message });
  }
});

// Start Server
app.listen(port, () => {
  console.log(`🚀 TicketBari Server is running on port ${port}`);
});