require("dotenv").config();

const scrapeSixTONES = require("./scraper");
const db = require("./firebase");
const getTargetMonths = require("./months");

async function main() {
    const months = getTargetMonths();
    const schedules = [];
    const dryRun = process.argv.includes("--dry-run");

    console.log("取得対象月:", months);
    console.log(
        dryRun
            ? "実行モード: DRY RUN（Firestoreへの書き込みなし）"
            : "実行モード: 通常実行"
    );

    // 各月の予定を取得する
    for (const month of months) {
        const data = await scrapeSixTONES(month);

        console.log(
            month,
            "取得件数:",
            data.length
        );

        // 対象月以外の日付が混入していないか検証する
        const expectedPrefix =
            `${month.slice(0, 4)}-${month.slice(4)}-`;

        const invalidSchedules = data.filter(
            item =>
                typeof item.date !== "string" ||
                !item.date.startsWith(expectedPrefix)
        );

        if (invalidSchedules.length > 0) {
            console.error(
                "対象月以外のデータを検出:",
                invalidSchedules
            );

            throw new Error(
                `${month}以外の日付が含まれています`
            );
        }

        schedules.push(...data);
    }

    console.log("全月の取得完了");
    console.log("取得総件数:", schedules.length);

    // DRY RUNではFirestoreに書き込まない
    if (dryRun) {
        console.log(
            "DRY RUN: Firestoreへの登録は行いません"
        );

        console.log(
            "取得データ:",
            JSON.stringify(schedules, null, 2)
        );

        return;
    }

    // 検証完了後にFirestoreへ反映する
    for (const schedule of schedules) {
        const id = createId(schedule);

        const ref = db
            .collection("sixtones_schedule")
            .doc(id);

        const snapshot = await ref.get();

        if (snapshot.exists) {
            const old = snapshot.data();

            const oldCompare = JSON.stringify({
                ...old,
                updatedAt: null
            });

            const newCompare = JSON.stringify({
                ...schedule,
                updatedAt: null
            });

            if (oldCompare === newCompare) {
                console.log("変更なし:", id);
                continue;
            }
        }

        // 出演者が特定できないデータは登録しない
        if (
            !Array.isArray(schedule.members) ||
            schedule.members.length === 0
        ) {
            console.log("メンバーなし:", id);
            continue;
        }

        // 出演者の重複を除去する
        schedule.members = [
            ...new Set(schedule.members)
        ];

        await ref.set(
            {
                ...schedule,
                updatedAt: new Date()
            },
            {
                merge: true
            }
        );

        console.log("登録・更新:", id);
    }

    console.log("Firestoreへの反映が完了しました");
}

function createId(item) {
    return [
        item.date,
        item.category,
        item.time || "",
        item.title
    ]
        .join("_")
        .replace(
            /[^a-zA-Z0-9_一-龠ぁ-んァ-ン]/g,
            ""
        );
}

main().catch(error => {
    console.error("処理に失敗しました:", error);
    process.exitCode = 1;
});