import express from "express";

const router = express.Router();

router.get("/", (req, res) => {
    res.status(200).json({
        status: 2000,
        success: true,
        service: "Sterllo wallet console API",
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        message: "Service is running",
        version: "1.0.0",
    })
});

export default router;