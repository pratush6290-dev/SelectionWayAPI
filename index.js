const express = require('express');
const mongoose = require('mongoose');
const axios = require('axios');
const cron = require('node-cron');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// Ab ye Render ke "Environment Variables" se password uthayega
const MONGO_URL = process.env.MONGO_URL;

mongoose.connect(MONGO_URL)
    .then(() => console.log("🚀 MongoDB Connected Successfully!"))
    .catch(err => console.error("❌ MongoDB Connection Error:", err));

// --- 2. DATABASE STRUCTURE (Schema) ---
const BatchSchema = new mongoose.Schema({
    id: { type: String, unique: true },
    title: String,
    banner: String,
    lectures: Array,
    pdfs: Array,
    lastUpdated: { type: Date, default: Date.now }
});

const Batch = mongoose.model('Batch', BatchSchema);

// --- 3. AUTO-SYNC LOGIC (Live Save) ---
const SOURCE_API = "https://selectionway.examsaathi.site";

async function syncData() {
    console.log("⏳ SelectionWay se data fetch ho raha hai...");
    try {
        const res = await axios.get(`${SOURCE_API}/allbatch`);
        const batches = res.data.data;

        for (let b of batches) {
            console.log(`Syncing Batch: ${b.title}`);
            const [lRes, pRes] = await Promise.all([
                axios.get(`${SOURCE_API}/chapter/${b.id}`).catch(() => ({ data: {} })),
                axios.get(`${SOURCE_API}/pdf/${b.id}`).catch(() => ({ data: {} }))
            ]);

            await Batch.findOneAndUpdate(
                { id: b.id },
                {
                    id: b.id,
                    title: b.title,
                    banner: b.banner,
                    lectures: lRes.data.classes || lRes.data.data || [],
                    pdfs: pRes.data.topics || [],
                    lastUpdated: new Date()
                },
                { upsert: true }
            );
        }
        console.log("✅ Backup Complete! Saara data MongoDB mein safe hai.");
    } catch (error) {
        console.error("❌ Sync Error:", error.message);
    }
}

// Har 30 minute mein auto-update hoga
cron.schedule('*/2 * * * *', syncData);

// --- 4. API ROUTES ---

// Saare batches ke liye: http://localhost:3000/allbatch
app.get('/allbatch', async (req, res) => {
    try {
        const data = await Batch.find({}, { lectures: 0, pdfs: 0 }); 
        res.json({ success: true, data: data });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Lectures ke liye: http://localhost:3000/chapter/ID
app.get('/chapter/:id', async (req, res) => {
    const batch = await Batch.findOne({ id: req.params.id });
    if (batch) res.json({ success: true, classes: batch.lectures });
    else res.json({ success: false, message: "Not found" });
});

// PDFs ke liye: http://localhost:3000/pdf/ID
app.get('/pdf/:id', async (req, res) => {
    const batch = await Batch.findOne({ id: req.params.id });
    if (batch) res.json({ success: true, topics: batch.pdfs });
    else res.json({ success: false, message: "Not found" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ Server is running on http://localhost:${PORT}`);
    syncData(); // Pehli baar server start hote hi sync karein

});

