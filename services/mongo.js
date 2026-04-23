import dotenv from "dotenv";
import mongoose from "mongoose";

dotenv.config();

let connectionPromise = null;

export async function connectMongo() {
    if (mongoose.connection.readyState === 1) {
        return mongoose;
    }

    if (connectionPromise) {
        return connectionPromise;
    }

    const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
    if (!uri) {
        throw new Error("MONGODB_URI is not configured in `.env`!");
    }

    connectionPromise = mongoose
        .connect(uri, {
            dbName: process.env.MONGODB_DB_NAME || undefined,
            serverSelectionTimeoutMS: 10000,
        })
        .then(() => mongoose)
        .catch((error) => {
            connectionPromise = null;
            throw error;
        });

    return connectionPromise;
}
