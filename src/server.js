import express from "express";
import path from "path";
import hbs from "hbs";
import { fileURLToPath } from "url";
import nodemailer from "nodemailer";
import crypto from "crypto";
import bcrypt from "bcrypt";
import mongoose from "mongoose";
import axios from "axios";
import session from "express-session";
import MongoStore from "connect-mongo";
import dotenv from "dotenv";
import collection from "./mongodb.js"; // Import MongoDB collection

dotenv.config(); // Load environment variables

// Helper for resolving paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const saltRounds = 10; // For bcrypt password hashing
const PORT = 3000;
const API_KEY = process.env.NEWS_API_KEY || "YOUR_NEWS_API_KEY"; // Use environment variable for security

// Connect to MongoDB
mongoose.connect("mongodb://localhost:27017/LoginSignupPage", {
    useNewUrlParser: true,
    useUnifiedTopology: true,
})
    .then(() => console.log("✅ MongoDB connected successfully..."))
    .catch(err => console.error("❌ Failed to connect to MongoDB:", err));

    

// Setup for templates and static files
const templatePath = path.join(__dirname, "../template");
app.use(express.static(path.join(__dirname, "../public")));
app.set("view engine", "hbs");
app.set("views", templatePath);
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// Nodemailer Transporter
const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: "k8419536@gmail.com", // Replace with your email
        pass: "ujipsjjrxrqhlbmz", // Replace with your email password or app password
    },
});

// Generate a token
function generateToken() {
    return crypto.randomBytes(32).toString("hex");
}

// Configure session middleware
app.use(session({
    secret: process.env.SESSION_SECRET || "mySecretKey", // Use an environment variable
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
        mongoUrl: "mongodb://localhost:27017/LoginSignupPage",
        collectionName: "sessions",
    }),
    cookie: { secure: false, maxAge: 1000 * 60 * 60 * 24 } // 1-day expiration
}));

// Middleware to check authentication
function isAuthenticated(req, res, next) {
    if (req.session.user) {
        next(); // User is logged in, continue
    } else {
        res.redirect("/"); // Redirect to login page
    }
}

// 📰 **News API with Authentication**
app.get("/api/news", isAuthenticated, async (req, res) => {
    try {
        const { q = "latest", page = 1, from = "", to = "", sortBy = "publishedAt" } = req.query;
        let apiUrl = `https://newsapi.org/v2/everything?q=${encodeURIComponent(q)}&apiKey=${API_KEY}&pageSize=10&page=${page}&sortBy=${sortBy}`;
        if (from) apiUrl += `&from=${from}`;
        if (to) apiUrl += `&to=${to}`;

        console.log(`Fetching news from: ${apiUrl}`);

        const response = await axios.get(apiUrl);
        res.json(response.data);
    } catch (error) {
        console.error("Error fetching news:", error.message);
        res.status(500).json({ error: "Failed to fetch news" });
    }
});

// Routes
app.get("/", (req, res) => {
    res.render("login");
});

app.get("/signup", (req, res) => {
    res.render("signup");
});

app.get("/dashboard", isAuthenticated, (req, res) => {
    res.render("dashboard", { user: req.session.user });
});

// Signup Route
app.post("/signup", async (req, res) => {
    const { name, gmailId, contactNumber, password, confirmPassword, username } = req.body;

    if (password !== confirmPassword) {
        return res.status(400).send("Passwords do not match.");
    }

    const finalUsername = (username || gmailId).toLowerCase();

    try {
        const existingUser = await collection.findOne({
            $or: [
                { gmailId: gmailId.toLowerCase() },
                { contactNumber },
                { username: finalUsername },
            ],
        });

        if (existingUser) {
            return res.status(400).send("Email, Contact Number, or Username already exists.");
        }

        const hashedPassword = await bcrypt.hash(password, saltRounds);
        const newUser = new collection({
            name,
            gmailId: gmailId.toLowerCase(),
            contactNumber,
            password: hashedPassword,
            username: finalUsername,
        });

        await newUser.save();
        res.redirect("/");
    } catch (err) {
        console.error("Error inserting data:", err);
        res.status(500).send("Error inserting data.");
    }
});

// Login Route
app.post("/login", async (req, res) => {
    const { username, password } = req.body;

    try {
        const user = await collection.findOne({ username: username.toLowerCase() });

        if (!user) {
            return res.status(400).send("Invalid username or password.");
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);

        if (!isPasswordValid) {
            return res.status(400).send("Invalid username or password.");
        }

        // Store user in session
        req.session.user = {
            id: user._id,
            name: user.name,
            username: user.username,
            gmailId: user.gmailId,
        };

        res.redirect("/dashboard"); // Redirect to dashboard after login
    } catch (err) {
        console.error("Error during login:", err);
        res.status(500).send("Error during login.");
    }
});

// Forgot Password Form
app.get("/forgot-password", (req, res) => {
    res.render("forgot-password");
});

// Forgot Password: Send Reset Email
app.post("/forgot-password", async (req, res) => {
    const { email } = req.body;

    try {
        const user = await collection.findOne({ gmailId: email.toLowerCase() });

        if (!user) {
            return res.status(400).send("If the email exists, a reset link will be sent.");
        }

        const token = generateToken();
        const expiry = new Date(Date.now() + 3600000); // 1-hour expiry

        user.resetToken = token;
        user.resetTokenExpiry = expiry;
        await user.save();

        const resetLink = `http://localhost:3000/reset-password/${token}`;
        await transporter.sendMail({
            from: "k8419536@gmail.com",
            to: email,
            subject: "Password Reset",
            text: `Click the following link to reset your password: ${resetLink}`,
        });

        console.log(`Reset link: ${resetLink}`);
        res.send("Reset email sent.");
    } catch (err) {
        console.error("Error during password reset:", err);
        res.status(500).send("Error sending reset email.");
    }
});

// Reset Password Form
app.get("/reset-password/:token", async (req, res) => {
    const { token } = req.params;

    try {
        const user = await collection.findOne({
            resetToken: token,
            resetTokenExpiry: { $gt: new Date() },
        });

        if (!user) {
            return res.status(400).send("Invalid or expired token.");
        }

        res.render("reset-password", { token });
    } catch (err) {
        console.error("Error validating reset token:", err);
        res.status(500).send("Error validating reset token.");
    }
});

// Reset Password Submission
app.post("/reset-password/:token", async (req, res) => {
    const { token } = req.params;
    const { newPassword } = req.body;

    try {
        const user = await collection.findOne({
            resetToken: token,
            resetTokenExpiry: { $gt: new Date() },
        });

        if (!user) {
            return res.status(400).send("Invalid or expired token.");
        }

        user.password = await bcrypt.hash(newPassword, saltRounds);
        user.resetToken = undefined;
        user.resetTokenExpiry = undefined;
        await user.save();

        res.send("Password reset successful.");
    } catch (err) {
        console.error("Error resetting password:", err);
        res.status(500).send("Error resetting password.");
    }
});


// Logout Route
app.get("/logout", (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error("Error during logout:", err);
            return res.status(500).send("Error during logout.");
        }
        res.redirect("/");
    });
});

// Start Server
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});

