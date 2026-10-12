require("dotenv").config();

const scrapeSixTONES =
    require("./scraper");

const db = require("./firebase");

const getTargetMonths = require("./months");

async function main() {
    const months = getTargetMonths();
    let schedules = [];
    for (const month of months) {
        const data = await scrapeSixTONES(month);
        console.log(
            month,
            "件数:",
            data.length
        );
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