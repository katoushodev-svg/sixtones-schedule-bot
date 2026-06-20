const admin = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

const serviceAccount = JSON.parse(process.env.FIREBASE_KEY);

admin.initializeApp({
    credential: admin.cert(serviceAccount)
});

const db = getFirestore();
module.exports = db;