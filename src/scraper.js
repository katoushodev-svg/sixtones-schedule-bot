const { chromium } = require("playwright");

const categories = [
    "TV",
    "RADIO",
    "MAGAZINE",
    "WEB",
    "RELEASE",
    "STAGE",
    "EVENT",
    "TICKET",
    "MOVIE"
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

function createUrl() {
    return "https://starto.jp/s/p/media/list?tag=42&list[]=42&artist=42";
}

/**
 * 表示中の年月取得
 */
async function getDisplayedMonth(page){
    const text = await page.locator("body").innerText();
    const months = text.match(/\d{4}\.\d{2}/g);

    if (!months) {
        return null;
    }
    // 重複しているため最初を採用
    return months[0].replace(".", "");
}

/**
 * SixTONESスケジュール取得
 */
async function scrapeSixTONES(month){
    const browser =
        await chromium.launch({
            headless:true
        });

    const context =
        await browser.newContext({
            locale:"ja-JP",
            javaScriptEnabled:true,
            serviceWorkers:"block"
        });

    const page = await context.newPage();
    const URL = createUrl();

    await page.goto(
        URL,
        {
            waitUntil:"networkidle",
            timeout:60000
        }
    );

    await page.waitForTimeout(3000);

    let currentMonth = await getDisplayedMonth(page);
    console.log(
        "現在:",
        currentMonth,
        "目的:",
        month
    );

    /**
     * 指定月まで次月ボタンを押す
     */
    let count = 0;
    while(currentMonth !== month){
        count++;
        if(count > 12){
            throw new Error(
                "月移動が12回を超えました"
            );
        }
        const nextButton =
            page.locator(
                ".c-pager__page.is-next"
            );
        await nextButton.click();
        await page.waitForTimeout(15000);
        currentMonth = await getDisplayedMonth(page);
    }
    await page.waitForTimeout(60000);
    const text = await page.locator("body").innerText();
    console.log(
        "取得ページ:",
        currentMonth
    );
    console.log(
        "年月:",
        text.match(/\d{4}\.\d{2}/g)
    );
    await browser.close();
    return parseSchedule(
        text,
        month
    );
}

function parseSchedule(text, month){
    let lines =
        text
        .split("\n")
        .map(v=>v.trim())
        .filter(Boolean);

    const startIndex =
        lines.findIndex(
            v => /^\d{4}\.\d{2}$/.test(v)
        );

    if(startIndex === -1){
        return [];
    }

    lines = lines.slice(startIndex);
    const results = [];
    let currentDate = null;
    const currentYearMonth = `${month.slice(0,4)}-${month.slice(4)}`;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        if (isDateLine(lines,i)) {
            currentDate = `${currentYearMonth}-${line.padStart(2,"0")}`;
            continue;
        }

        if (categories.includes(line)) {
            const category = line;
            let time = null;
            let title = null;
            let station = null;
            let members = [];
            let j = i + 1;
            while (j < lines.length && !categories.includes(lines[j]) && !isDateLine(lines,j)){
                const value = lines[j];
                // 時刻
                if (/^\d{1,2}:\d{2}[-−ー]?$/.test(value.trim())) {
                    time = value.trim().replace("-", "");
                    j++;
                    continue;
                }
                // 出演者
                const matchedMembers = sixtonesMembers.filter(member =>
                    value.includes(member)
                );
                if (matchedMembers.length > 0) {
                    members.push(...matchedMembers);
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

            if (title && currentDate) {
                const match = title.match(/(.*?)\s*\((.*?)\)/);
                if (match) {
                    title =
                        match[1].trim();

                    station =
                        match[2].trim();
                }

                results.push({
                    date:currentDate,
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

function isDateLine(lines,i){
    return (/^\d{1,2}$/.test(lines[i])
        && /^\((SUN|MON|TUE|WED|THU|FRI|SAT)\)$/.test(lines[i+1]));
}
module.exports = scrapeSixTONES;