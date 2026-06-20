const { chromium } = require("playwright");

function createUrl(month){
    return "https://starto.jp/s/p/media/list?tag=42&list[]=42&artist=42" + `&dy=${month}`;
}

async function scrapeSixTONES(month) {
    const URL = createUrl(month);
    console.log('URL: ', URL)

    const browser =
        await chromium.launch({
            headless: true
        });

    const page =
        await browser.newPage({
            locale: "ja-JP"
        });

    await page.goto(
        URL,
        {
            waitUntil: "networkidle",
            timeout: 60000
        }
    );
    await page.waitForTimeout(3000);
    const text = await page.locator("body").innerText();
    await browser.close();
    return parseSchedule(text, month);
}

function parseSchedule(text, month) {
    let lines = text.split("\n").map(v=>v.trim()).filter(Boolean);
    const startIndex = lines.findIndex(v => /^\d{4}\.\d{2}$/.test(v));
    if(startIndex === -1){
        return [];
    }
    lines = lines.slice(startIndex);

    const results = [];
    let currentDate = null;
    const categories = [
        "TV",
        "RADIO",
        "MAGAZINE",
        "WEB",
        "RELEASE",
        "CONCERT",
        "STAGE",
        "EVENT",
        "TICKET",
        "MOVIE",
        "BIRTHDAY"
    ];
    const sixtonesMembers = [
        "ジェシー",
        "京本大我",
        "松村北斗",
        "髙地優吾",
        "森本慎太郎",
        "田中樹",
        "SixTONES"
    ];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        if (/^\d{1,2}$/.test(line) && lines[i + 1]?.match(/^\(/)) {
            currentDate = `${month.slice(0, 4)}-${month.slice(4)}-${line.padStart(2, "0")}`;
            continue;
        }

        if (categories.includes(line)) {
            const category = line;
            let time = null;
            let title = null;
            let station = null;
            let members = [];
            let j = i + 1;
            while (j < lines.length
                &&
                !categories.includes(lines[j])
                &&
                !(
                    /^\d{1,2}$/.test(lines[j])
                    &&
                    lines[j + 1]?.match(/^\(/)
                )
            ) {
                const value = lines[j];
                // 時刻
                if (/^\d{1,2}:\d{2}[-−ー]?$/.test(value.trim())) {
                    time = value.trim().replace("-", "");

                    j++;
                    continue;
                }
                // 出演者
                if (sixtonesMembers.includes(value)) {
                    members.push(value);
                    j++;
                    continue;
                }

                // タイトル
                if (!title) {
                    title = value;
                    j++;
                    continue;
                }
                j++;
            }

            if (title) {
                // 放送局分離
                const match = title.match(/(.*?)\s*\((.*?)\)/);
                if (match) {
                    title =
                        match[1].trim();

                    station =
                        match[2].trim();
                }

                results.push({
                    date: currentDate,
                    category,
                    time,
                    title,
                    station,
                    members
                });
            }
        }
    }
    return results;

}

module.exports = scrapeSixTONES;