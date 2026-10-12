require("dotenv").config();

const scrapeSixTONES =
    require("./scraper");

const db = require("./firebase");

const getTargetMonths = require("./months");

async function main() {
    const months = getTargetMonths();
    let schedules = [];
    // for (const month of months) {
    //     const data = await scrapeSixTONES(month);
    //     console.log(
    //         month,
    //         "件数:",
    //         data.length
    //     );
    //     schedules.push(...data);
    // }
    const dryRun = process.argv.includes("--dry-run");
    for (const month of months) {
        const data = await scrapeSixTONES(month);

        console.log(month, "件数:", data.length);

        // 対象月以外のデータがあれば登録前にエラーにする
        const invalidSchedules = data.filter(
            item => !item.date.startsWith(
                `${month.slice(0, 4)}-${month.slice(4)}-`
            )
        );

        if (invalidSchedules.length > 0) {
            console.error("対象月以外のデータを検出:", invalidSchedules);
            throw new Error(`${month}以外のデータが含まれています`);
        }

        schedules.push(...data);
    }

    for (const schedule of schedules) {
        const id = createId(schedule);
        const ref = db.collection("sixtones_schedule").doc(id);
        const snapshot = await ref.get();
        if(snapshot.exists){
            const old = snapshot.data();
            const oldCompare =
                JSON.stringify(
                    {
                        ...old,
                        updatedAt:null
                    }
                );
            const newCompare =
                JSON.stringify(
                    {
                        ...schedule,
                        updatedAt:null
                    }
                );

            if (oldCompare===newCompare) {
                console.log("変更なし:", id);
                continue;
            }
        }

        if (schedule.members.length === 0) {
            console.log("メンバーなし", id);
            continue;
        }

        if (schedule.members.length > 0) {
            schedule.members = [...new Set(schedule.members)];
        }

        // if (dryRun) {
        //     console.log("DRY RUN: Firestoreへの登録は行いません");
        //     console.log("取得件数:", schedules.length);
        //     console.log("取得データ:", JSON.stringify(schedules, null, 2));
        //     return;
        // }

        await ref.set({
            ...schedule,
            updatedAt: new Date()
        },
        {
            merge: true
        });
    }
}

function createId(item) {
    return [
        item.date,
        item.category,
        item.time || "",
        item.title
    ].join("_")
    .replace(
        /[^a-zA-Z0-9_一-龠ぁ-んァ-ン]/g,
        ""
    );
}

main().catch(console.error);