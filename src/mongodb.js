import mongoose from "mongoose";

// Connect to MongoDB
mongoose.connect("mongodb://localhost:27017/LoginSignupPage", {
    useNewUrlParser: true,
    useUnifiedTopology: true,
})
    .then(() => console.log("✅ MongoDB connected successfully..."))
    .catch(err => console.error("❌ Failed to connect to MongoDB:", err));

// Defining the user schema
const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    gmailId: { type: String, required: true, unique: true },
    contactNumber: { type: String, required: true },
    password: { type: String, required: true },
    username: { type: String, required: true, unique: true },
    resetToken: { type: String, index: true },
    resetTokenExpiry: { type: Date }
});

// Create the model
const collection = mongoose.model("MyCol", userSchema); // "MyCol" is the collection name

export default collection; // ✅ Export as default for ES Modules
