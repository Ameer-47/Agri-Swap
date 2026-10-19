const mongoose = require("mongoose");

const connectDB = async () => {
    try {
        if (!process.env.MONGO_URI) {
            console.warn("⚠️ [WARN] MONGO_URI is not set. Running in database-disconnected mode.");
            return false;
        }

        await mongoose.connect(process.env.MONGO_URI, {
            dbName: "agri_swap",
            serverSelectionTimeoutMS: 5000
        });
        console.log("MongoDB connected");
        return true;
    } catch (error) {
        console.warn("⚠️ [WARN] MongoDB connection failed:", error.message);
        console.warn("⚠️ [WARN] Local Price Analytics, DuckDB dataset queries, and LSTM inference will continue operating normally without MongoDB.");
        return false;
    }
};

module.exports = connectDB;