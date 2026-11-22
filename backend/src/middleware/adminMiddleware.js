
const jwt = require("jsonwebtoken");
const User = require("../models/user");
const redisClient = require("../config/redis");

const adminMiddleware = async (req, res, next) => {
    try {
        // Get token from cookies
        const token = req.cookies?.token;

        if (!token) {
            return res.status(401).send("Token is not present");
        }

        // Verify JWT token
        const payload = jwt.verify(token, process.env.JWT_KEY);

        const { _id } = payload;

        if (!_id) {
            return res.status(401).send("Invalid token");
        }

        // Find user in MongoDB
        const result = await User.findById(_id);

        if (!result) {
            return res.status(401).send("User Doesn't Exist");
        }

        // Check admin role
        if (result.role !== "admin") {
            return res.status(403).send("Admin access required");
        }

        // Check whether token is blocked in Redis
        const isBlocked = await redisClient.exists(`token:${token}`);

        if (isBlocked) {
            return res.status(401).send("Invalid Token");
        }

        // Store authenticated admin
        req.result = result;

        next();

    } catch (err) {
        console.error("Admin Middleware Error:", err.message);

        return res.status(401).send("Error: " + err.message);
    }
};

module.exports = adminMiddleware;
