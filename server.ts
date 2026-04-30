import express from "express";
import { createServer as createViteServer } from "vite";
import cors from "cors";
import path from "path";
import Razorpay from "razorpay";

const PORT = 3000;

async function startServer() {
  const app = express();

  app.use(cors());
  app.use(express.json());

  // Razorpay Initialization
  let razorpay: Razorpay | null = null;
  const getRazorpay = () => {
    if (!razorpay) {
      const key_id = process.env.RAZORPAY_KEY_ID;
      const key_secret = process.env.RAZORPAY_KEY_SECRET;
      
      if (!key_id || !key_secret) {
        throw new Error('Razorpay keys are required in environment variables');
      }
      
      razorpay = new Razorpay({
        key_id,
        key_secret
      });
    }
    return razorpay;
  };

  // API Route to create an order
  app.post("/api/create-order", async (req, res) => {
    try {
      const rzp = getRazorpay();
      const { amount, currency = "MYR", receipt } = req.body;
      
      const order = await rzp.orders.create({
        amount: amount * 100, // amount in the smallest currency unit
        currency,
        receipt: receipt || `receipt_${Date.now()}`
      });
      
      res.json({
        ...order,
        key_id: process.env.RAZORPAY_KEY_ID
      });
    } catch (error) {
       console.error("Error creating order:", error);
       res.status(500).json({ error: String(error) });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Correctly serve the dist folder
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
