// ==========================================
// 1. LIBRARIES (Sabse upar)
// ==========================================
const express = require('express');
const mongoose = require('mongoose');
const axios = require('axios');
const cron = require('node-cron');
const cors = require('cors');

// ==========================================
// 2. APP INITIALIZATION & MIDDLEWARE
// ==========================================
const app = express();
app.use(cors());
app.use(express.json());

// ==========================================
// 3. DATABASE CONNECTION (MongoDB Atlas)
// ==========================================
const MONGO_URL = process.env.MONGO_URL;

mongoose.connect(MONGO_URL)
    .then(() => console.log("🚀 MongoDB Connected Successfully!"))
    .catch(err => console.error("❌ MongoDB Connection Error:", err));

// ==========================================
// 4. DATABASE STRUCTURE (Schema)
// ==========================================
const BatchSchema = new mongoose.Schema({
    id: { type: String, unique: true },
    title: String,
    banner: String,
    lectures: Array,
    pdfs: Array,
    lastUpdated: { type: Date, default: Date.now }
});

const Batch = mongoose.model('Batch', BatchSchema);

// ==========================================
// 5. AUTO-SYNC LOGIC (Live Backup Function)
// ==========================================
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

// CRON JOB: Har 2-5 minute mein update karne ke liye (Aapne 1 min set kiya hai)
cron.schedule('*/2 * * * *', syncData);

// ==========================================
// 6. API ROUTES (Address)
// ==========================================

// --- A. Home Page Route ---
app.get('/', (req, res) => {
    res.json({
        message: "🚀 SelectionWay API is Live and Running!",
        status: "Healthy",
        sync_interval: "Every 2-5 minutes",
        endpoints: {
            all_batches: "/allbatch",
            force_sync: "/force-sync",
            batch_details: "/chapter/[batch_id]",
            pdf_details: "/pdf/[batch_id]"
        },
        author: "SelectionWay Team"
    });
});

// --- B. Manual Sync Trigger (Force Sync) ---
app.get('/force-sync', async (req, res) => {
    try {
        await syncData();
        res.json({ success: true, message: "Sync successful! Data updated." });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// --- C. All Batches Route ---
app.get('/allbatch', async (req, res) => {
    try {
        const data = await Batch.find({}, { lectures: 0, pdfs: 0 }); 
        res.json({ success: true, data: data });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// --- D. Lectures/Chapter Route ---
app.get('/chapter/:id', async (req, res) => {
    try {
        const batch = await Batch.findOne({ id: req.params.id });
        if (batch) res.json({ success: true, classes: batch.lectures });
        else res.json({ success: false, message: "Batch not found" });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// --- E. PDFs Route ---
app.get('/pdf/:id', async (req, res) => {
    try {
        const batch = await Batch.findOne({ id: req.params.id });
        if (batch) res.json({ success: true, topics: batch.pdfs });
        else res.json({ success: false, message: "PDFs not found" });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ==========================================
// 7. SERVER START (Sabse niche)
// ==========================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Server is running on http://localhost:${PORT}`);
    syncData(); // Pehli baar server start hote hi sync karein
});
