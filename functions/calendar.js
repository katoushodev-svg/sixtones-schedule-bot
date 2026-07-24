const ical = require("ical-generator").default;

/**
 * Dateへ変換
 */
function normalizeDate(value) {
    if (!value) {
        return null;
    }

    if (value instanceof Date) {
        return value;
    }

    // Firestore Timestamp対応
    if (typeof value.toDate === "function") {
        return value.toDate();
    }

    const date = new Date(value);

    if (isNaN(date.getTime())) {
        return null;
    }

    return date;
}

/**
 * 開始日時生成
 */
function createStart(date, time) {
    const start = new Date(date);

    if (time) {
        const [hour, minute] = time.split(":").map(Number);

        start.setHours(hour, minute, 0, 0);
    } else {
        // 時刻なしイベント
        start.setHours(9, 0, 0, 0);
    }

    return start;
}

/**
 * 終了日時生成
 */
function createEnd(start, hasTime) {
    const end = new Date(start);

    if (hasTime) {
        // TV等は1時間イベント扱い
        end.setHours(end.getHours() + 1);
    } else {
        // 時刻なしは30分イベント
        end.setMinutes(end.getMinutes() + 30);
    }

    return end;
}

/**
 * iCalendar生成
 */
function buildCalendar(scheduleItems) {

    const calendar = ical({
        name: "SixTONES Schedule",
        prodId: {
            company: "STARTO",
            product: "SixTONES Schedule",
            language: "JA"
        },
        timezone: "Asia/Tokyo"
    });

    calendar.method("PUBLISH");

    const items = Array.isArray(scheduleItems)
        ? scheduleItems
        : [];

    for (const item of items) {

        const date = normalizeDate(item.date);

        if (!date) {
            continue;
        }

        const start = createStart(date, item.time);

        const end = createEnd(
            start,
            !!item.time
        );

        const summary = [
            item.category,
            item.title
        ]
            .filter(Boolean)
            .join(" ");

        const description = [

            item.members?.length
                ? `出演者\n${item.members.join("\n")}`
                : null,

            item.station
                ? `\n放送局\n${item.station}`
                : null,

            item.url
                ? `\n公式サイト\n${item.url}`
                : null

        ]
            .filter(Boolean)
            .join("\n\n");

        const uid = [
            item.date,
            item.category,
            item.time || "",
            item.title
        ]
            .join("_")
            .replace(/[^\wぁ-んァ-ン一-龠]/g, "");

        const event = calendar.createEvent({

            id: uid,

            start,

            end,

            summary,

            description,

            location: item.station || "",

            url: item.url || "",

            organizer: {
                name: "STARTO ENTERTAINMENT"
            },

            timezone: "Asia/Tokyo"

        });

        // 通知
        if (item.time) {

            // 1時間前通知
            event.createAlarm({
                type: "display",
                trigger: 60 * 60
            });

        } else {

            // 開始時刻通知
            event.createAlarm({
                type: "display",
                trigger: 0
            });

        }

    }

    return calendar;

}

module.exports = {
    buildCalendar
};