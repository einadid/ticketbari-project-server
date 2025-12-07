const { MongoClient } = require('mongodb');
require('dotenv').config();

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.lqrwz0p.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri);

const tickets = [
  {
    title: "Dhaka to Cox's Bazar Relax Transport",
    fromLocation: "Dhaka",
    toLocation: "Cox's Bazar",
    transportType: "bus",
    price: 1200,
    ticketQuantity: 40,
    departureDateTime: "2025-03-10T22:30:00.000Z",
    perks: ["AC", "WiFi", "Water", "Blanket"],
    image: "https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?w=800",
    vendorName: "Relax Transport",
    vendorEmail: "vendor@ticketbari.com", // আপনার ভেন্ডর ইমেইল দিন
    verificationStatus: "approved", // সরাসরি অ্যাপ্রুভড
    isAdvertised: true,
    isHidden: false,
    createdAt: new Date().toISOString()
  },
  {
    title: "Dhaka to Sylhet Green Line",
    fromLocation: "Dhaka",
    toLocation: "Sylhet",
    transportType: "bus",
    price: 850,
    ticketQuantity: 35,
    departureDateTime: "2025-03-11T08:00:00.000Z",
    perks: ["AC", "Snacks", "Charging Port"],
    image: "https://images.unsplash.com/photo-1570125909232-eb263c188f7e?w=800",
    vendorName: "Green Line",
    vendorEmail: "vendor@ticketbari.com",
    verificationStatus: "approved",
    isAdvertised: true,
    isHidden: false,
    createdAt: new Date().toISOString()
  },
  {
    title: "Chittagong to Dhaka Saudia",
    fromLocation: "Chittagong",
    toLocation: "Dhaka",
    transportType: "bus",
    price: 650,
    ticketQuantity: 45,
    departureDateTime: "2025-03-12T14:00:00.000Z",
    perks: ["Non-AC", "Comfortable Seats"],
    image: "https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?w=800",
    vendorName: "Saudia",
    vendorEmail: "vendor@ticketbari.com",
    verificationStatus: "approved",
    isAdvertised: false,
    isHidden: false,
    createdAt: new Date().toISOString()
  },
  {
    title: "Dhaka to Khulna Hanif Enterprise",
    fromLocation: "Dhaka",
    toLocation: "Khulna",
    transportType: "bus",
    price: 900,
    ticketQuantity: 30,
    departureDateTime: "2025-03-13T20:00:00.000Z",
    perks: ["AC", "WiFi", "Dinner"],
    image: "https://images.unsplash.com/photo-1570125909232-eb263c188f7e?w=800",
    vendorName: "Hanif Enterprise",
    vendorEmail: "vendor@ticketbari.com",
    verificationStatus: "approved",
    isAdvertised: false,
    isHidden: false,
    createdAt: new Date().toISOString()
  }
  // আপনি চাইলে এখানে আরও টিকেট যোগ করতে পারেন...
];

async function seedDB() {
  try {
    await client.connect();
    console.log("✅ Connected to MongoDB");

    const db = client.db("ticketBariDB");
    const ticketsCollection = db.collection("tickets");

    // আগের সব টিকেট মুছে নতুন করে অ্যাড করতে চাইলে:
    // await ticketsCollection.deleteMany({}); 
    
    const result = await ticketsCollection.insertMany(tickets);
    console.log(`🎉 ${result.insertedCount} tickets inserted successfully!`);

  } catch (err) {
    console.error(err);
  } finally {
    await client.close();
  }
}

seedDB();