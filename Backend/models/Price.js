const mongoose = require("mongoose");

const priceSchema = new mongoose.Schema({
    commodity: String,
    state: String,
    district: String,
    market: String,
    date: Date,
    modalPrice: Number
});

module.exports = mongoose.model("Price", priceSchema);