// Re-export connectDB from ./config/db for backward compatibility and clean root access
const connectDB = require("./config/db");

module.exports = connectDB;
