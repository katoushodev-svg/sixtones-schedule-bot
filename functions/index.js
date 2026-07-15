const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const { buildCalendar } = require("./calendar");

// Firebase初期化
if (!admin.apps.length) {
    admin.initializeApp();
}

const db = admin.firestore();

/**
 * SixTONES iCalendar配信
 *
 * URL例
 * https://xxxx.cloudfunctions.net/getSixtonesIcs
 */
exports.getSixtonesIcs = onRequest(
    {
        region: "asia-northeast1",
        memory: "256MiB",
        timeoutSeconds: 60
    },
    async (req, res) => {

        try {

            // GETのみ許可
            if (req.method !== "GET") {
                res.status(405).send("Method Not Allowed");
                return;
            }

            console.log("ICS Generate Start");

            // Firestore取得
            const snapshot = await db
                .collection("sixtones_schedule")
                .orderBy("date")
                .get();

            const schedules = [];

            snapshot.forEach(doc => {
                schedules.push(doc.data());
            });

            console.log(`取得件数: ${schedules.length}`);

            // iCalendar生成
            const calendar = buildCalendar(schedules);

            // キャッシュ
            res.set(
                "Cache-Control",
                "public, max-age=300"
            );

            res.set(
                "Content-Type",
                "text/calendar; charset=utf-8"
            );

            res.set(
                "Content-Disposition",
                'inline; filename="sixtones.ics"'
            );

            res.status(200).send(calendar.toString());

            console.log("ICS Generate Complete");

        } catch (error) {

            console.error(
                "ICS Generate Error",
                error
            );

            res
                .status(500)
                .send("Internal Server Error");

        }

    }
);